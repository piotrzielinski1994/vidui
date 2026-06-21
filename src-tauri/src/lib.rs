mod focus;
mod hls_server;
mod import;
mod logging;
mod media;

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Greetings from Tauri.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            logging::init(app.handle());
            // Fresh HLS root each launch (wipe any leftovers), then start the
            // loopback server that feeds the webview's native HLS player.
            let root = std::env::temp_dir().join("vidui-hls");
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root)?;
            let (port, _server) = hls_server::start(root.clone())?;
            log::info!("HLS server listening on 127.0.0.1:{port} root={root:?}");
            app.manage(media::HlsState {
                root,
                port,
                current: std::sync::Mutex::new(None),
            });
            // Warm the ffmpeg/ffprobe sidecars now (behind the empty UI) so the
            // first dropped file doesn't pay their cold first-spawn cost.
            media::prewarm_sidecars(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            media::prepare_media,
            media::log_playback,
            focus::focus_webview,
            import::expand_dropped_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::greet;

    #[test]
    fn should_greet_with_name_when_given_one() {
        assert_eq!(greet("World"), "Hello, World! Greetings from Tauri.");
    }

    #[test]
    fn should_greet_with_empty_name_when_name_is_blank() {
        assert_eq!(greet(""), "Hello, ! Greetings from Tauri.");
    }
}
