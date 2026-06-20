use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::async_runtime;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
pub struct PreparedMedia {
    pub path: String,
    pub transcoded: bool,
}

const DIRECT_VIDEO: &[&str] = &["h264"];
const DIRECT_AUDIO: &[&str] = &["aac", "mp3", ""];

// How long to wait for the first streamable bytes before giving up, and how big
// the growing fragmented MP4 must get before we hand it to <video>.
const FIRST_BYTES_TIMEOUT: Duration = Duration::from_secs(20);
const MIN_STREAM_BYTES: u64 = 256 * 1024;

fn is_directly_playable(vcodec: &str, acodec: &str) -> bool {
    DIRECT_VIDEO.contains(&vcodec) && DIRECT_AUDIO.contains(&acodec)
}

async fn probe_stream(app: &tauri::AppHandle, path: &str, stream: &str) -> String {
    let command = match app.shell().sidecar("ffprobe") {
        Ok(command) => command,
        Err(_) => return String::new(),
    };
    let output = command
        .args([
            "-v", "error", "-select_streams", stream, "-show_entries",
            "stream=codec_name", "-of", "csv=p=0", path,
        ])
        .output()
        .await;
    match output {
        Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        Err(_) => String::new(),
    }
}

fn cache_path(source: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    let mut dir = std::env::temp_dir();
    dir.push("vidui-transcode");
    let _ = std::fs::create_dir_all(&dir);
    dir.push(format!("{:x}.mp4", hasher.finish()));
    dir
}

fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

#[tauri::command]
pub async fn prepare_media(
    app: tauri::AppHandle,
    path: String,
) -> Result<PreparedMedia, String> {
    let vcodec = probe_stream(&app, &path, "v:0").await;
    if vcodec.is_empty() {
        return Err(format!(
            "ffprobe found no video stream (or bundled ffmpeg failed) for: {path}"
        ));
    }
    let acodec = probe_stream(&app, &path, "a:0").await;

    if is_directly_playable(&vcodec, &acodec) {
        return Ok(PreparedMedia { path, transcoded: false });
    }

    let target = cache_path(&path);
    // A previously completed transcode is reused as-is.
    if target.exists() && file_len(&target) > MIN_STREAM_BYTES {
        return Ok(PreparedMedia {
            path: target.to_string_lossy().into_owned(),
            transcoded: true,
        });
    }
    let _ = std::fs::remove_file(&target);

    // Spawn ffmpeg writing a FRAGMENTED MP4 and DON'T wait for it to finish.
    // Fragmented output is progressively playable, so <video> can start as soon
    // as the first fragments land while encoding races ahead (faster than
    // realtime). h264_videotoolbox is hardware-accelerated on macOS.
    let target_str = target.to_string_lossy().into_owned();
    let video_args: &[&str] = if cfg!(target_os = "macos") {
        &["-c:v", "h264_videotoolbox", "-b:v", "6M"]
    } else {
        &["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
    };
    let command = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("failed to resolve bundled ffmpeg: {e}"))?
        .args(["-y", "-v", "error", "-i", &path])
        .args(video_args)
        .args([
            "-c:a", "aac", "-movflags",
            "frag_keyframe+empty_moov+default_base_moof", &target_str,
        ]);

    let (mut rx, child) = command
        .spawn()
        .map_err(|e| format!("failed to start ffmpeg: {e}"))?;

    // The shell plugin force-pipes stdout/stderr into a bounded channel; nobody
    // draining it would stall ffmpeg once the pipe buffer fills. Drain it in a
    // detached task that records termination so the loop below can react. The
    // child is NOT killed when prepare_media returns (CommandChild has no Drop),
    // so encoding races ahead while <video> streams the growing fragmented MP4.
    let terminated = Arc::new(AtomicBool::new(false));
    let succeeded = Arc::new(AtomicBool::new(false));
    let terminated_drain = terminated.clone();
    let succeeded_drain = succeeded.clone();
    async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(payload) = event {
                succeeded_drain.store(payload.code == Some(0), Ordering::SeqCst);
                terminated_drain.store(true, Ordering::SeqCst);
            }
        }
    });

    // Wait only until enough bytes exist to start streaming (not full encode).
    let started = Instant::now();
    loop {
        if file_len(&target) > MIN_STREAM_BYTES {
            break;
        }
        if terminated.load(Ordering::SeqCst) {
            // ffmpeg exited. Only an actual failure is an error; a clean exit
            // whose output is below the stream threshold (a very short clip) is
            // still a complete, playable file.
            if !succeeded.load(Ordering::SeqCst) {
                let _ = std::fs::remove_file(&target);
                return Err(format!("ffmpeg transcode failed for: {path}"));
            }
            break;
        }
        if started.elapsed() > FIRST_BYTES_TIMEOUT {
            let _ = child.kill();
            let _ = std::fs::remove_file(&target);
            return Err(format!("timed out preparing: {path}"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    Ok(PreparedMedia { path: target_str, transcoded: true })
}

#[cfg(test)]
mod tests {
    use super::{cache_path, is_directly_playable};

    #[test]
    fn should_be_directly_playable_when_h264_with_aac() {
        assert!(is_directly_playable("h264", "aac"));
    }

    #[test]
    fn should_be_directly_playable_when_h264_with_mp3() {
        assert!(is_directly_playable("h264", "mp3"));
    }

    #[test]
    fn should_be_directly_playable_when_h264_with_no_audio() {
        assert!(is_directly_playable("h264", ""));
    }

    #[test]
    fn should_not_be_directly_playable_when_vp9_with_opus() {
        assert!(!is_directly_playable("vp9", "opus"));
    }

    #[test]
    fn should_not_be_directly_playable_when_av1_with_aac() {
        assert!(!is_directly_playable("av1", "aac"));
    }

    #[test]
    fn should_not_be_directly_playable_when_h264_with_ac3() {
        assert!(!is_directly_playable("h264", "ac3"));
    }

    #[test]
    fn should_not_be_directly_playable_when_no_codecs() {
        assert!(!is_directly_playable("", ""));
    }

    #[test]
    fn should_return_same_path_when_called_twice_with_same_source() {
        let source = "/some/video/file.mkv";
        assert_eq!(cache_path(source), cache_path(source));
    }

    #[test]
    fn should_land_under_vidui_transcode_dir_when_building_cache_path() {
        let path = cache_path("/some/video/file.mkv");
        assert!(path.to_string_lossy().contains("vidui-transcode"));
    }

    #[test]
    fn should_have_mp4_suffix_when_building_cache_path() {
        let path = cache_path("/some/video/file.mkv");
        assert_eq!(path.extension().and_then(|e| e.to_str()), Some("mp4"));
    }
}
