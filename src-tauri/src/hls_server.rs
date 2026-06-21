use std::path::{Component, Path, PathBuf};
use std::thread::JoinHandle;

use tiny_http::{Header, Response, Server};

// Web-compatible MIME for the two HLS file kinds WKWebView's native player fetches.
// Unknown names fall back to a generic binary type rather than guessing.
fn hls_mime(filename: &str) -> &'static str {
    if filename.ends_with(".m3u8") {
        return "application/vnd.apple.mpegurl";
    }
    if filename.ends_with(".ts") {
        return "video/mp2t";
    }
    "application/octet-stream"
}

// Map an HTTP request path to a real file INSIDE root, or None. Security-critical:
// any non-normal component (`..`, a root/prefix segment) is rejected outright, and
// the final path must canonicalize to something still under root - so a request can
// never escape the served directory.
fn resolve_under_root(root: &Path, url_path: &str) -> Option<PathBuf> {
    let relative = url_path.trim_start_matches('/');
    if relative.is_empty() {
        return None;
    }
    let is_unsafe = Path::new(relative)
        .components()
        .any(|component| !matches!(component, Component::Normal(_)));
    if is_unsafe {
        return None;
    }
    let root_real = std::fs::canonicalize(root).ok()?;
    let candidate = std::fs::canonicalize(root_real.join(relative)).ok()?;
    candidate.starts_with(&root_real).then_some(candidate)
}

fn respond(request: tiny_http::Request, root: &Path) {
    let url_path = request.url().split('?').next().unwrap_or("").to_string();
    let Some(path) = resolve_under_root(root, &url_path) else {
        let _ = request.respond(Response::empty(404));
        return;
    };
    let Ok(file) = std::fs::File::open(&path) else {
        let _ = request.respond(Response::empty(404));
        return;
    };
    let mime = hls_mime(&path.file_name().unwrap_or_default().to_string_lossy());
    let header = Header::from_bytes(b"Content-Type".as_slice(), mime.as_bytes())
        .expect("static mime header is valid");
    let _ = request.respond(Response::from_file(file).with_header(header));
}

// Loopback-only HTTP server over `root`. Binds 127.0.0.1:0 (OS-assigned port) so it
// is never reachable off-machine, and serves nothing outside `root`. Returns the
// chosen port; the worker thread runs for the app's lifetime.
pub fn start(root: PathBuf) -> std::io::Result<(u16, JoinHandle<()>)> {
    let server = Server::http("127.0.0.1:0").map_err(std::io::Error::other)?;
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    let handle = std::thread::spawn(move || {
        for request in server.incoming_requests() {
            respond(request, &root);
        }
    });
    Ok((port, handle))
}

#[cfg(test)]
mod tests {
    use super::{hls_mime, resolve_under_root, start};
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::ops::Deref;
    use std::path::{Path, PathBuf};

    // A unique tempdir that removes itself on drop, so tests don't leave a trail of
    // `vidui-hls-test-*` dirs in the OS temp dir. Derefs to Path, so call sites use
    // it like a path. Created on disk so canonicalize-based checks have a real root.
    struct TempRoot(PathBuf);

    impl Deref for TempRoot {
        type Target = Path;
        fn deref(&self) -> &Path {
            &self.0
        }
    }

    impl AsRef<Path> for TempRoot {
        fn as_ref(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn unique_root() -> TempRoot {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let mut dir = std::env::temp_dir();
        dir.push(format!("vidui-hls-test-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create test root");
        TempRoot(dir)
    }

    // AC-001: .m3u8 -> the HLS playlist MIME
    #[test]
    fn should_return_mpegurl_mime_when_name_ends_with_m3u8() {
        assert_eq!(hls_mime("index.m3u8"), "application/vnd.apple.mpegurl");
    }

    // AC-001: .ts -> the MPEG-TS segment MIME
    #[test]
    fn should_return_mp2t_mime_when_name_ends_with_ts() {
        assert_eq!(hls_mime("seg00001.ts"), "video/mp2t");
    }

    // AC-001: an unrecognised extension falls back to the generic binary MIME
    #[test]
    fn should_return_octet_stream_mime_when_extension_is_unknown() {
        assert_eq!(hls_mime("foo.bar"), "application/octet-stream");
    }

    // AC-001: a name with no extension also falls back to the generic binary MIME
    #[test]
    fn should_return_octet_stream_mime_when_name_has_no_extension() {
        assert_eq!(hls_mime("README"), "application/octet-stream");
    }

    // AC-004: a plain file directly under root resolves to a path inside root
    #[test]
    fn should_resolve_to_path_under_root_when_file_is_directly_under_root() {
        let root = unique_root();
        std::fs::write(root.join("index.m3u8"), b"#EXTM3U").expect("write file");
        let resolved = resolve_under_root(&root, "/index.m3u8").expect("should resolve");
        let root_real = std::fs::canonicalize(&root).expect("canonicalize root");
        assert!(
            resolved.starts_with(&root_real),
            "{resolved:?} should start with {root_real:?}"
        );
    }

    // AC-004: a nested file under root resolves to a path inside root
    #[test]
    fn should_resolve_to_path_under_root_when_file_is_nested_under_root() {
        let root = unique_root();
        std::fs::create_dir_all(root.join("job1")).expect("create nested dir");
        std::fs::write(root.join("job1/index.m3u8"), b"#EXTM3U").expect("write file");
        let resolved = resolve_under_root(&root, "/job1/index.m3u8").expect("should resolve");
        let root_real = std::fs::canonicalize(&root).expect("canonicalize root");
        assert!(
            resolved.starts_with(&root_real),
            "{resolved:?} should start with {root_real:?}"
        );
    }

    // AC-004: a leading-`..` traversal escaping root is rejected
    #[test]
    fn should_reject_when_url_path_traverses_above_root() {
        let root = unique_root();
        assert_eq!(resolve_under_root(&root, "../../etc/passwd"), None);
    }

    // AC-004: an embedded `..` that climbs out of root is rejected
    #[test]
    fn should_reject_when_url_path_embeds_traversal_escaping_root() {
        let root = unique_root();
        assert_eq!(resolve_under_root(&root, "job1/../../../etc/passwd"), None);
    }

    // AC-004: an absolute path pointing outside root is rejected
    #[test]
    fn should_reject_when_url_path_is_absolute_outside_root() {
        let root = unique_root();
        assert_eq!(resolve_under_root(&root, "/etc/passwd"), None);
    }

    // AC-004: an empty url path targets no file
    #[test]
    fn should_reject_when_url_path_is_empty() {
        let root = unique_root();
        assert_eq!(resolve_under_root(&root, ""), None);
    }

    // AC-004: a bare "/" targets no file
    #[test]
    fn should_reject_when_url_path_is_only_root_slash() {
        let root = unique_root();
        assert_eq!(resolve_under_root(&root, "/"), None);
    }

    fn http_get(port: u16, path: &str) -> String {
        let mut stream =
            TcpStream::connect(("127.0.0.1", port)).expect("connect to loopback server");
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
        .expect("write request");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("read response");
        response
    }

    // AC-001: the running server serves a real playlist file with the HLS MIME
    #[test]
    fn should_serve_m3u8_with_hls_mime_when_file_exists() {
        let root = unique_root();
        std::fs::write(root.join("index.m3u8"), b"#EXTM3U\n").expect("write playlist");
        let (port, _server) = start(root.to_path_buf()).expect("start server");
        let response = http_get(port, "/index.m3u8");
        assert!(response.contains("200 OK"), "expected 200, got: {response}");
        assert!(
            response.contains("application/vnd.apple.mpegurl"),
            "expected HLS mime, got: {response}"
        );
        assert!(
            response.contains("#EXTM3U"),
            "expected body, got: {response}"
        );
    }

    // AC-004: a traversal request to the running server is refused, not served
    #[test]
    fn should_return_404_when_request_escapes_root() {
        let root = unique_root();
        let (port, _server) = start(root.to_path_buf()).expect("start server");
        let response = http_get(port, "/../../etc/passwd");
        assert!(response.contains("404"), "expected 404, got: {response}");
    }
}
