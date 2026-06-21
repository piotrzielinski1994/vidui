# Plan: HLS instant playback (FR-14)

## Approach

Stream, don't pre-transcode. ffmpeg writes an HLS playlist + TS segments progressively into a temp
dir; a loopback HTTP server serves that dir; `<video>` plays the `http://localhost/.../index.m3u8`
URL via WKWebView's native HLS, starting on the first segment (~0.2s). Passthrough MP4s are
untouched (`asset://`). No persistent cache.

## Task breakdown (TDD where pure logic exists)

1. **Add `tiny_http` dependency** (`Cargo.toml`).

2. **Pure helpers in `hls_server.rs` (RED first):**
   - `hls_mime(filename) -> &'static str`: `.m3u8` -> `application/vnd.apple.mpegurl`, `.ts` ->
     `video/mp2t`, else `application/octet-stream`. Tests: each extension + unknown.
   - `resolve_under_root(root, url_path) -> Option<PathBuf>`: strip leading `/`, reject `..` and
     absolute, join under root, return `Some` only if it stays inside root. Tests: simple file,
     nested file, `../` escape -> None, absolute `/etc/passwd` -> None, empty -> None.

3. **HTTP server (`hls_server.rs`):** `start(root: PathBuf) -> (u16, thread)` binds
   `tiny_http::Server::http("127.0.0.1:0")`, reads the OS-assigned port, spawns a thread looping on
   requests: map URL path via `resolve_under_root`; 404 if missing/escaped; else stream the file
   with `Content-Type` from `hls_mime`. Loopback-only, serves only `root`.

4. **State + setup (`lib.rs` / `media.rs`):** at `setup`, create the HLS root under temp
   (`vidui-hls/`, wiped first), start the server, `app.manage(HlsState { root, port, current: Mutex::new(None) })`.

5. **`prepare_media` rewrite (`media.rs`):**
   - Probe once (`probe_media`, kept). No-video -> error.
   - `plan_media`. Passthrough -> return source path, `transcoded:false` (unchanged, no server).
   - Convert -> kill+clean any `current` job; make a fresh `vidui-hls/<job-id>/` dir; spawn ffmpeg:
     `-i <src> -c:v copy_or_reencode -c:a aac -aac_coder fast -f hls -hls_time 4
     -hls_playlist_type event -hls_flags append_list -hls_segment_filename <dir>/seg%05d.ts
     <dir>/index.m3u8`. Video uses the existing `video_convert_args` (copy when h264).
     Detached-drain the event channel (reuse pre-`d335287` `async_runtime::spawn` pattern) so ffmpeg
     keeps running; store `HlsJob { dir, child }` in `current`.
   - Poll (bounded, ~20s timeout) until `index.m3u8` + first `seg00000.ts` exist; then return
     `http://localhost:PORT/<job-id>/index.m3u8`, `transcoded:true`. Timeout -> clean + error.
   - `job-id` derived from a process-unique counter (no `Math.random`/time in tests; this is runtime
     Rust so `Instant`/atomic counter is fine).

6. **FE (`tauri.ts`):** `prepareMediaUrl` returns the path as-is when it already starts with
   `http://` / `https://`; otherwise `convertFileSrc` (asset). Add a vitest. `viewport.tsx` needs no
   change (it just sets `<video src>`); the FR-12 timeline still works (onCanPlay fires on HLS too).

7. **Cleanup:** kill+remove on new activation (step 5). Best-effort wipe `vidui-hls/` at startup.
   Remove the old `cache_path`/v2 logic + `.part` rename + complete-MP4 transcode block (superseded).

## Execution order

tiny_http dep -> RED (`hls_mime`, `resolve_under_root`) -> GREEN those -> server -> state/setup ->
prepare_media rewrite -> FE scheme branch + test -> manual on-device verify (the streaming start,
mixed-content check, file-switch cleanup are integration-level, validated by the user via logs).

## File changes

- `src-tauri/Cargo.toml` - add `tiny_http`.
- `src-tauri/src/hls_server.rs` - NEW: server + `hls_mime` + `resolve_under_root` + tests.
- `src-tauri/src/media.rs` - rewrite `prepare_media` to HLS-stream; drop cache/.part/complete-MP4;
  keep `probe_media`/`parse_probe_json`/`plan_media`/`video_convert_args`.
- `src-tauri/src/lib.rs` - register module, start server, manage `HlsState`.
- `src/lib/tauri.ts` - `prepareMediaUrl` scheme branch + test.

## Acceptance verification

- `cargo test` green (hls_mime, resolve_under_root, parse_probe_json, plan_media, untouched ones).
- `npm test` green (FE scheme branch).
- clippy + fmt clean.
- Manual (user): drop the 32-min MKV -> starts ~instantly, log `prepare` << full-encode time;
  switch files -> old job gone; passthrough mp4 still `asset://`. Confirm no mixed-content block in
  the webview console.

## Risks

- Mixed content (tauri:// page -> http://localhost media): expected OK (localhost trustworthy, CSP
  null); verify on device. Fallback: `stream://` range protocol for a complete MP4.
- ffmpeg detached child leak if app crashes mid-stream: OS reaps; we kill on switch + wipe root on
  startup.
- tiny_http blocking thread per request: fine for a single local consumer (one `<video>`).

## Decision Log

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-06-21 | HLS + native WKWebView player over fragmented-MP4-via-custom-protocol | AVFoundation handles HLS and IGNORES Tauri custom schemes; HLS needs real http. Native HLS gives correct duration via EVENT playlist (fixes the old fragmented-MP4 duration bug) and true play-while-encode. |
| 2026-06-21 | Loopback `tiny_http` server, not `tauri-plugin-localhost` | Need to serve a runtime temp dir with custom MIME + traversal guard, not the app bundle; plugin serves app assets. tiny_http is sync, tiny, no async runtime. |
| 2026-06-21 | Drop the persistent transcode cache entirely | User explicitly does not want a cache; streaming makes first-open fast without one, and removing it kills the stale-cache bug class (FR-13 fragmented file + `.part` muxer). |
| 2026-06-21 | Keep passthrough on `asset://` | mp4/h264/aac already plays in 196ms over the range-capable asset protocol; no reason to route it through the server/encoder. |
