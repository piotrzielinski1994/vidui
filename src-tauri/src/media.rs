use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{async_runtime, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
pub struct PreparedMedia {
    pub path: String,
    pub transcoded: bool,
    // Real source duration (seconds), so the FE can show it while an HLS stream's
    // own duration is still Infinity. None when ffprobe didn't report one.
    #[serde(rename = "durationSec")]
    pub duration_sec: Option<f64>,
}

// A running HLS encode: the ffmpeg child (kept alive past prepare_media so it
// streams ahead of playback) plus the segment dir, so the next activation can
// kill and clean it.
pub struct HlsJob {
    pub dir: PathBuf,
    pub child: CommandChild,
}

// App-lifetime state for HLS streaming: the temp root the loopback server serves,
// its port, and the single in-flight job (only one video plays at a time).
pub struct HlsState {
    pub root: PathBuf,
    pub port: u16,
    pub current: Mutex<Option<HlsJob>>,
}

// How long to wait for ffmpeg's first HLS segment before giving up. The encoder
// runs far faster than realtime, so the first segment normally lands in well
// under a second; this is a generous ceiling for pathological inputs.
const FIRST_SEGMENT_TIMEOUT: Duration = Duration::from_secs(20);

fn next_job_id() -> u64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum VideoAction {
    Copy,
    Reencode,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum AudioAction {
    Copy,
    Reencode,
    Drop,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum MediaPlan {
    Passthrough,
    Convert {
        video: VideoAction,
        audio: AudioAction,
    },
}

// Pure decision: given the container (ffprobe format_name), video codec and audio
// codec (a:"" = no audio), decide what the webview needs. MP4-family + h264 +
// webview-playable audio is served untouched; anything else is converted, copying
// the streams that are already fine and re-encoding only those that are not.
fn plan_media(container: &str, vcodec: &str, acodec: &str) -> MediaPlan {
    let video = if vcodec == "h264" {
        VideoAction::Copy
    } else {
        VideoAction::Reencode
    };
    let audio = match acodec {
        "" => AudioAction::Drop,
        "aac" | "mp3" => AudioAction::Copy,
        _ => AudioAction::Reencode,
    };
    let is_mp4_container = container.contains("mp4");
    let is_webview_ready = video == VideoAction::Copy && audio != AudioAction::Reencode;
    if is_mp4_container && is_webview_ready {
        return MediaPlan::Passthrough;
    }
    MediaPlan::Convert { video, audio }
}

#[derive(Debug, PartialEq)]
pub struct ProbeResult {
    pub container: String,
    pub vcodec: String,
    pub acodec: String,
    // Total source duration in seconds. HLS EVENT playlists don't declare a total
    // length until the encode ends, so `<video>.duration` reads Infinity mid-stream
    // - we carry the real duration through to the FE. None if ffprobe omits it.
    pub duration_sec: Option<f64>,
}

// Pure parser of one `ffprobe -of json` payload: container = format.format_name,
// vcodec = first video stream's codec_name, acodec = first audio stream's,
// duration = format.duration (a string of seconds). A missing stream leaves its
// field "" (no video -> caller errors; no audio -> Drop). Junk/empty input parses
// to an all-empty result rather than panicking.
fn parse_probe_json(json: &str) -> ProbeResult {
    let root: serde_json::Value = serde_json::from_str(json).unwrap_or(serde_json::Value::Null);
    let container = root["format"]["format_name"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let duration_sec = root["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok());
    let codec_for = |kind: &str| {
        root["streams"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|s| s["codec_type"].as_str() == Some(kind))
            .and_then(|s| s["codec_name"].as_str())
            .unwrap_or("")
            .to_string()
    };
    ProbeResult {
        container,
        vcodec: codec_for("video"),
        acodec: codec_for("audio"),
        duration_sec,
    }
}

// One ffprobe spawn yields container + both codecs (replaces three sequential
// spawns; each Tauri sidecar spawn carries ~500ms overhead). A failed spawn or
// non-JSON output parses to an all-empty result.
async fn probe_media(app: &tauri::AppHandle, path: &str) -> ProbeResult {
    let command = match app.shell().sidecar("ffprobe") {
        Ok(command) => command,
        Err(_) => return parse_probe_json(""),
    };
    let output = command
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=format_name,duration:stream=codec_name,codec_type",
            "-of",
            "json",
            path,
        ])
        .output()
        .await;
    match output {
        Ok(out) => parse_probe_json(&String::from_utf8_lossy(&out.stdout)),
        Err(_) => parse_probe_json(""),
    }
}

// Pay the first-spawn cost of the bundled sidecars at startup, not on the user's
// first drop. The binaries are ~60MB Developer-ID-signed Mach-Os; macOS runs a
// one-time Gatekeeper check + pages them in on first exec, which otherwise lands
// as ~2-3s of latency on the first prepare_media. A trivial `-version` run warms
// the OS caches. Best-effort: errors are ignored.
pub fn prewarm_sidecars(app: &tauri::AppHandle) {
    for binary in ["ffprobe", "ffmpeg"] {
        let Ok(command) = app.shell().sidecar(binary) else {
            continue;
        };
        async_runtime::spawn(async move {
            let _ = command.arg("-version").output().await;
        });
    }
}

fn video_convert_args(action: VideoAction) -> Vec<&'static str> {
    match action {
        VideoAction::Copy => vec!["-c:v", "copy"],
        VideoAction::Reencode if cfg!(target_os = "macos") => {
            vec!["-c:v", "h264_videotoolbox", "-b:v", "6M"]
        }
        VideoAction::Reencode => {
            vec!["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
        }
    }
}

fn audio_convert_args(action: AudioAction) -> Vec<&'static str> {
    match action {
        AudioAction::Copy => vec!["-c:a", "copy"],
        // `-aac_coder fast` skips the default two-loop bit allocator: ~4x faster
        // (44s -> 11s on a 32-min file) at transparent quality for playback.
        AudioAction::Reencode => vec!["-c:a", "aac", "-aac_coder", "fast"],
        AudioAction::Drop => vec!["-an"],
    }
}

// Frontend -> same log file channel. The FE measures sub-second playback phases
// with performance.now() (the log timestamps are only second-granular) and sends
// the formatted one-liner here to land beside the backend prepare_media lines.
#[tauri::command]
pub fn log_playback(message: String) {
    log::info!("{message}");
}

// Kill + remove the previously streaming job, if any. Called before starting a
// new one (only one video plays at a time) so old ffmpeg processes and segment
// dirs don't pile up in temp.
fn stop_current_job(state: &HlsState) {
    let Some(job) = state.current.lock().ok().and_then(|mut g| g.take()) else {
        return;
    };
    let pid = job.child.pid();
    let _ = job.child.kill();
    let _ = std::fs::remove_dir_all(&job.dir);
    log::info!(
        "prepare_media stopped previous HLS job pid={pid} dir={:?}",
        job.dir
    );
}

#[tauri::command]
pub async fn prepare_media(app: tauri::AppHandle, path: String) -> Result<PreparedMedia, String> {
    let started = Instant::now();

    let ProbeResult {
        container,
        vcodec,
        acodec,
        duration_sec,
    } = probe_media(&app, &path).await;
    if vcodec.is_empty() {
        log::error!("prepare_media failed: no video stream (or bundled ffmpeg failed) path={path}");
        return Err(format!(
            "ffprobe found no video stream (or bundled ffmpeg failed) for: {path}"
        ));
    }
    log::info!("prepare_media path={path} container={container} v={vcodec} a={acodec}");

    let plan = plan_media(&container, &vcodec, &acodec);
    log::info!("prepare_media plan={plan:?}");
    let (video, audio) = match plan {
        // Already webview-playable: serve the file untouched via the asset
        // protocol. No HLS, no server, no encode.
        MediaPlan::Passthrough => {
            log::info!(
                "prepare_media passthrough in {}ms path={path}",
                started.elapsed().as_millis()
            );
            return Ok(PreparedMedia {
                path,
                transcoded: false,
                duration_sec,
            });
        }
        MediaPlan::Convert { video, audio } => (video, audio),
    };

    stream_hls(&app, &path, video, audio, duration_sec, started).await
}

// Stream the file as HLS: ffmpeg writes an EVENT playlist + TS segments into a
// fresh per-job dir while we return the playlist URL as soon as the first segment
// exists. WKWebView's native player pulls the rest as they encode (the encoder
// runs ahead of realtime), so playback starts in ~0.2s instead of after the full
// transcode - the VLC "decode on the fly" model.
async fn stream_hls(
    app: &tauri::AppHandle,
    path: &str,
    video: VideoAction,
    audio: AudioAction,
    duration_sec: Option<f64>,
    started: Instant,
) -> Result<PreparedMedia, String> {
    let state = app
        .try_state::<HlsState>()
        .ok_or_else(|| "HLS server not initialised".to_string())?;
    stop_current_job(&state);

    let job_id = next_job_id();
    let dir = state.root.join(job_id.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create HLS dir: {e}"))?;
    let playlist = dir.join("index.m3u8");
    let segment_pattern = dir.join("seg%05d.ts");

    let command = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("failed to resolve bundled ffmpeg: {e}"))?
        .args(["-y", "-v", "error", "-i", path])
        .args(video_convert_args(video))
        .args(audio_convert_args(audio))
        .args(["-f", "hls", "-hls_time", "4", "-hls_playlist_type", "event"])
        .arg("-hls_segment_filename")
        .arg(segment_pattern.to_string_lossy().into_owned())
        .arg(playlist.to_string_lossy().into_owned());

    let (mut rx, child) = command
        .spawn()
        .map_err(|e| format!("failed to start ffmpeg: {e}"))?;

    // Drain the bounded stdout/stderr channel in a detached task so ffmpeg never
    // blocks on a full pipe buffer; record termination + stderr so the poll loop
    // can tell a real failure (exit != 0) from a clean finish.
    let terminated = Arc::new(AtomicBool::new(false));
    let succeeded = Arc::new(AtomicBool::new(false));
    let stderr = Arc::new(Mutex::new(String::new()));
    let (terminated_d, succeeded_d, stderr_d) =
        (terminated.clone(), succeeded.clone(), stderr.clone());
    async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Terminated(payload) => {
                    succeeded_d.store(payload.code == Some(0), Ordering::SeqCst);
                    terminated_d.store(true, Ordering::SeqCst);
                }
                CommandEvent::Stderr(bytes) => {
                    if let Ok(mut s) = stderr_d.lock() {
                        s.push_str(&String::from_utf8_lossy(&bytes));
                    }
                }
                _ => {}
            }
        }
    });

    let first_segment = dir.join("seg00000.ts");
    let result = poll_first_segment(&playlist, &first_segment, &terminated, &succeeded, started);
    match result {
        Ok(()) => {
            let url = format!("http://localhost:{}/{job_id}/index.m3u8", state.port);
            *state
                .current
                .lock()
                .map_err(|_| "HLS state poisoned".to_string())? = Some(HlsJob { dir, child });
            log::info!(
                "prepare_media HLS first segment in {}ms path={path} url={url}",
                started.elapsed().as_millis()
            );
            Ok(PreparedMedia {
                path: url,
                transcoded: true,
                duration_sec,
            })
        }
        Err(reason) => {
            let _ = child.kill();
            let _ = std::fs::remove_dir_all(&dir);
            let detail = stderr
                .lock()
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            log::error!("prepare_media failed: {reason} path={path} stderr={detail}");
            Err(format!("ffmpeg transcode failed for: {path}"))
        }
    }
}

// Block until the playlist + first segment exist (ready to stream), ffmpeg dies,
// or we time out. The encoder is far faster than realtime, so this returns in a
// fraction of a second for normal files.
fn poll_first_segment(
    playlist: &std::path::Path,
    first_segment: &std::path::Path,
    terminated: &AtomicBool,
    succeeded: &AtomicBool,
    started: Instant,
) -> Result<(), String> {
    loop {
        if playlist.exists() && first_segment.exists() {
            return Ok(());
        }
        if terminated.load(Ordering::SeqCst) {
            // A clean exit before the first segment means a tiny clip the playlist
            // still describes; only a non-zero exit is a real failure.
            if succeeded.load(Ordering::SeqCst) && playlist.exists() {
                return Ok(());
            }
            return Err("ffmpeg exited before producing a segment".to_string());
        }
        if started.elapsed() > FIRST_SEGMENT_TIMEOUT {
            return Err("timed out waiting for first HLS segment".to_string());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[cfg(test)]
mod tests {
    use super::{
        audio_convert_args, parse_probe_json, plan_media, AudioAction, MediaPlan, ProbeResult,
        VideoAction,
    };

    const MP4: &str = "mov,mp4,m4a,3gp,3g2,mj2";
    const MKV: &str = "matroska,webm";

    const MP4_H264_AAC_JSON: &str = r#"{
        "programs": [],
        "stream_groups": [],
        "streams": [
            { "codec_name": "h264", "codec_type": "video" },
            { "codec_name": "aac", "codec_type": "audio" }
        ],
        "format": { "format_name": "mov,mp4,m4a,3gp,3g2,mj2" }
    }"#;

    const MKV_H264_OPUS_JSON: &str = r#"{
        "programs": [],
        "stream_groups": [],
        "streams": [
            { "codec_name": "h264", "codec_type": "video" },
            { "codec_name": "opus", "codec_type": "audio" }
        ],
        "format": { "format_name": "matroska,webm" }
    }"#;

    // TC-001: mp4 + h264 + aac is served untouched (AC-005)
    #[test]
    fn should_passthrough_when_mp4_h264_aac() {
        assert_eq!(plan_media(MP4, "h264", "aac"), MediaPlan::Passthrough);
    }

    // TC-007: mp4 + h264 + mp3 is also fine (AC-005)
    #[test]
    fn should_passthrough_when_mp4_h264_mp3() {
        assert_eq!(plan_media(MP4, "h264", "mp3"), MediaPlan::Passthrough);
    }

    // TC-002: h264 in mkv only needs a container remux - copy both streams (AC-002)
    #[test]
    fn should_remux_copy_when_mkv_h264_aac() {
        assert_eq!(
            plan_media(MKV, "h264", "aac"),
            MediaPlan::Convert {
                video: VideoAction::Copy,
                audio: AudioAction::Copy,
            }
        );
    }

    // TC-003: vp9 + opus needs full re-encode of both (AC-003, AC-004)
    #[test]
    fn should_reencode_both_when_mkv_vp9_opus() {
        assert_eq!(
            plan_media(MKV, "vp9", "opus"),
            MediaPlan::Convert {
                video: VideoAction::Reencode,
                audio: AudioAction::Reencode,
            }
        );
    }

    // TC-004: mp4 container but av1 video - re-encode video, copy the fine audio (AC-003)
    #[test]
    fn should_reencode_video_copy_audio_when_mp4_av1_aac() {
        assert_eq!(
            plan_media(MP4, "av1", "aac"),
            MediaPlan::Convert {
                video: VideoAction::Reencode,
                audio: AudioAction::Copy,
            }
        );
    }

    // TC-005: no audio stream -> drop audio (AC-004)
    #[test]
    fn should_drop_audio_when_mkv_h264_no_audio() {
        assert_eq!(
            plan_media(MKV, "h264", ""),
            MediaPlan::Convert {
                video: VideoAction::Copy,
                audio: AudioAction::Drop,
            }
        );
    }

    // TC-006: avi + h264 + ac3 - copy video, re-encode the bad audio (AC-004)
    #[test]
    fn should_copy_video_reencode_audio_when_avi_h264_ac3() {
        assert_eq!(
            plan_media("avi", "h264", "ac3"),
            MediaPlan::Convert {
                video: VideoAction::Copy,
                audio: AudioAction::Reencode,
            }
        );
    }

    // AC-002: one ffprobe json yields container + video codec + audio codec
    #[test]
    fn should_populate_all_fields_when_parsing_mp4_h264_aac_json() {
        assert_eq!(
            parse_probe_json(MP4_H264_AAC_JSON),
            ProbeResult {
                container: MP4.to_string(),
                vcodec: "h264".to_string(),
                acodec: "aac".to_string(),
                duration_sec: None,
            }
        );
    }

    // AC-002: mkv h264 + opus parsed correctly
    #[test]
    fn should_populate_all_fields_when_parsing_mkv_h264_opus_json() {
        assert_eq!(
            parse_probe_json(MKV_H264_OPUS_JSON),
            ProbeResult {
                container: MKV.to_string(),
                vcodec: "h264".to_string(),
                acodec: "opus".to_string(),
                duration_sec: None,
            }
        );
    }

    // FR-14 duration: format.duration (a seconds string) is parsed to f64 so the FE
    // can show a real length while an HLS stream's own duration is still Infinity
    #[test]
    fn should_parse_duration_seconds_when_present_in_json() {
        let json = r#"{
            "streams": [
                { "codec_name": "h264", "codec_type": "video" }
            ],
            "format": { "format_name": "matroska,webm", "duration": "1922.581000" }
        }"#;
        assert_eq!(parse_probe_json(json).duration_sec, Some(1922.581));
    }

    // duration is optional - a payload without format.duration yields None, not a panic
    #[test]
    fn should_leave_duration_none_when_absent_from_json() {
        assert_eq!(parse_probe_json(MKV_H264_OPUS_JSON).duration_sec, None);
    }

    // AC-002 / AC-005 edge: no audio stream -> acodec == ""
    #[test]
    fn should_leave_acodec_empty_when_no_audio_stream_in_json() {
        let json = r#"{
            "streams": [
                { "codec_name": "h264", "codec_type": "video" }
            ],
            "format": { "format_name": "matroska,webm" }
        }"#;
        let result = parse_probe_json(json);
        assert_eq!(result.vcodec, "h264");
        assert_eq!(result.acodec, "");
    }

    // AC-005: no video stream (audio only) -> vcodec == ""
    #[test]
    fn should_leave_vcodec_empty_when_no_video_stream_in_json() {
        let json = r#"{
            "streams": [
                { "codec_name": "aac", "codec_type": "audio" }
            ],
            "format": { "format_name": "mov,mp4,m4a,3gp,3g2,mj2" }
        }"#;
        let result = parse_probe_json(json);
        assert_eq!(result.vcodec, "");
        assert_eq!(result.acodec, "aac");
    }

    // edge: junk / non-json input -> all-empty ProbeResult, no panic
    #[test]
    fn should_return_empty_result_when_parsing_junk_input() {
        assert_eq!(
            parse_probe_json("not json at all {{{"),
            ProbeResult {
                container: String::new(),
                vcodec: String::new(),
                acodec: String::new(),
                duration_sec: None,
            }
        );
    }

    // edge: empty string -> all-empty ProbeResult, no panic
    #[test]
    fn should_return_empty_result_when_parsing_empty_string() {
        assert_eq!(
            parse_probe_json(""),
            ProbeResult {
                container: String::new(),
                vcodec: String::new(),
                acodec: String::new(),
                duration_sec: None,
            }
        );
    }

    // an aac re-encode must use the fast coder (the default two-loop coder is ~4x
    // slower on long files, the dominant cost of a cache-miss transcode)
    #[test]
    fn should_use_fast_aac_coder_when_reencoding_audio() {
        let args = audio_convert_args(AudioAction::Reencode);
        let coder = args.iter().position(|&a| a == "-aac_coder");
        assert_eq!(coder.and_then(|i| args.get(i + 1)), Some(&"fast"));
    }
}
