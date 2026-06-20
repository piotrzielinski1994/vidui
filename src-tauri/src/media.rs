use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use serde::Serialize;

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

fn probe_stream(path: &str, stream: &str) -> String {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error", "-select_streams", stream, "-show_entries",
            "stream=codec_name", "-of", "csv=p=0", path,
        ])
        .output();
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
pub async fn prepare_media(path: String) -> Result<PreparedMedia, String> {
    let vcodec = probe_stream(&path, "v:0");
    if vcodec.is_empty() {
        return Err(format!(
            "ffprobe found no video stream (or ffmpeg missing) for: {path}"
        ));
    }
    let acodec = probe_stream(&path, "a:0");

    let is_directly_playable =
        DIRECT_VIDEO.contains(&vcodec.as_str()) && DIRECT_AUDIO.contains(&acodec.as_str());
    if is_directly_playable {
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
    let mut command = Command::new("ffmpeg");
    command
        .args(["-y", "-v", "error", "-i", &path])
        .args(video_args)
        .args([
            "-c:a", "aac", "-movflags",
            "frag_keyframe+empty_moov+default_base_moof", &target_str,
        ]);

    let mut child = command
        .spawn()
        .map_err(|e| format!("failed to start ffmpeg: {e}"))?;

    // Wait only until enough bytes exist to start streaming (not full encode).
    let started = Instant::now();
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            // ffmpeg exited; if it failed and produced nothing, report it.
            if !status.success() && file_len(&target) <= MIN_STREAM_BYTES {
                let _ = std::fs::remove_file(&target);
                return Err(format!("ffmpeg transcode failed for: {path}"));
            }
            break;
        }
        if file_len(&target) > MIN_STREAM_BYTES {
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
