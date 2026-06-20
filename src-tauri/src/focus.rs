// Workaround for tauri-apps/tao#208 / tauri#9389: on macOS the WKWebView loses
// first-responder status after a fullscreen transition (and on launch), so it
// stops receiving keyboard events until the user clicks. Window-level setFocus
// does NOT fix it - only making the web content NSView the window's first
// responder does. This must be done in native code; JS cannot reach it.

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn focus_webview(window: tauri::WebviewWindow) -> Result<(), String> {
    use objc2::runtime::AnyObject;
    use objc2::msg_send;

    window
        .with_webview(|webview| {
            // webview.inner() is the WKWebView, which is an NSView subclass.
            let view = webview.inner() as *mut AnyObject;
            let ns_window = webview.ns_window() as *mut AnyObject;
            if view.is_null() || ns_window.is_null() {
                return;
            }
            unsafe {
                let _: bool = msg_send![ns_window, makeFirstResponder: view];
            }
        })
        .map_err(|e| format!("with_webview failed: {e}"))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn focus_webview(_window: tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}
