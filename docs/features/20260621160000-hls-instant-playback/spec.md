# Spec: HLS instant playback (FR-14)

**Version:** 0.1.0
**Created:** 2026-06-21
**Status:** Draft
**Feature:** FR-14 (new)
**Branch note:** developed on `20260621134500-fast-playback-start` (single-session continuation of the
playback-speed work; local rule forbids mid-session branch switch, so the folder name and branch
deliberately differ).

## 1. Overview / why

Goal: a dropped file plays **immediately, on first open, like VLC** - no multi-second wait.

Why we're slow today: WKWebView's `<video>` only decodes MP4/H.264/AAC, so any MKV/Opus/VP9/AV1
file is fully transcoded to a complete MP4 **before** playback starts. Measured on a 32-min MKV:
the remux (video `-c:v copy` + audio) of the WHOLE file takes ~11s up front. VLC is instant
because it demuxes + decodes on the fly from the file's index and never rewrites the whole file.

Key measurements that shape the design:
- Remuxing video+audio of the full 32-min file = **0.46s** (video is `-c:v copy`, instant).
- The only slow step is encoding audio (opus->aac) of the whole file up front (~11s), though the
  encoder runs ~175x realtime.
- ffmpeg HLS output: the **first segment + playlist are ready in ~0.2s**, then segments stream in
  as they encode.

So: don't wait for the whole file. Stream it. ffmpeg writes an HLS playlist (`.m3u8`) + MPEG-TS
segments (`.ts`) progressively; `<video>` starts on the first segment and pulls the rest as they
land. This is the VLC model (play while decoding) adapted to the webview.

**Hard constraint that drives the architecture:** HLS in WKWebView is handled by AVFoundation,
which **bypasses Tauri custom-scheme handlers** (`asset://`). HLS will not load over `asset://`.
It requires a real `http://localhost` URL. Therefore this feature adds a tiny loopback HTTP
server that serves the HLS temp directory.

We also **drop the persistent transcode cache** (the user does not want it): each playback streams
fresh into a per-session temp dir, cleaned when the active file changes or the app exits. This
removes the whole stale-cache bug class (FR-13's fragmented-file and `.part` muxer issues).

## 2. Scope

In:
- A loopback HTTP server (`hls_server.rs`) bound to `127.0.0.1:<os-assigned port>`, serving only the
  HLS temp root, with correct MIME for `.m3u8`/`.ts` and path-traversal protection. Started once at
  app setup; port held in managed state.
- `prepare_media` rewritten: passthrough files keep the `asset://` path; non-passthrough files
  spawn ffmpeg writing HLS progressively (detached), and the command returns the
  `http://localhost:PORT/<job>/index.m3u8` URL as soon as the first segment + playlist exist.
- Killing + cleaning the previous streaming job when a new file is activated.
- FE: play an `http(s)://` URL directly; keep `convertFileSrc` for `asset://` file paths.

Out:
- Reusing/caching completed HLS output across opens (explicitly no cache).
- hls.js / MSE (WKWebView native HLS only; MSE + `.ts` is unreliable there).
- Adaptive bitrate / multiple renditions (single rendition).
- Windows/Linux verification (macOS is the target; server + native HLS via the OS player are
  cross-platform in principle but only macOS is validated this round).
- Seeking UX polish beyond what native HLS gives.

## 3. Acceptance Criteria

| ID | Criterion | Priority | How verified |
|----|-----------|----------|--------------|
| AC-001 | A loopback HTTP server serves files from the HLS root, returning `application/vnd.apple.mpegurl` for `.m3u8` and `video/mp2t` for `.ts`, and is bound only to `127.0.0.1` | must | `hls_mime` unit tests + manual `curl 127.0.0.1:PORT/.../index.m3u8 -I` |
| AC-002 | A non-passthrough file (e.g. MKV h264/opus) returns an `http://localhost:PORT/.../index.m3u8` URL as soon as the first segment is ready, WITHOUT waiting for the full encode | must | manual: drop file, log shows `prepare ... ms` well under the full-encode time + video starts ~instantly; FR-12 timeline log |
| AC-003 | A passthrough file (mp4/h264/aac) is still served via `asset://` with no HTTP server / transcode involved | must | `plan_media` Passthrough path unchanged; manual log shows `passthrough` |
| AC-004 | The HTTP server rejects path-traversal (`..`, absolute escape) and only serves paths resolving inside the HLS root | must | `resolve_under_root` unit tests (traversal, absolute, nested-ok) |
| AC-005 | Activating a new file kills the previous ffmpeg streaming job and removes its segment dir | must | manual: switch files mid-stream, old ffmpeg pid gone, old dir removed; log line |
| AC-006 | `plan_media` codec/container decision is unchanged | must | existing `plan_media` tests stay green |
| AC-007 | The FE plays an `http(s)://` prepared URL directly and still runs `asset://` file paths through `convertFileSrc` | must | vitest on `prepareMediaUrl` scheme branch |

## 4. Data model

- `PreparedMedia { path: String, transcoded: bool }` (unchanged shape). For HLS, `path` is the full
  `http://localhost:PORT/<job>/index.m3u8` URL and `transcoded = true`. For passthrough it stays the
  source file path (`transcoded = false`). FE distinguishes by URL scheme.
- Managed state `HlsState { root: PathBuf, port: u16, current: Mutex<Option<HlsJob>> }`.
- `HlsJob { dir: PathBuf, child: CommandChild }` - the running ffmpeg + its segment dir, so the next
  activation can kill + clean it.

## 5. Pure (unit-tested) helpers

- `parse_probe_json(&str) -> ProbeResult` (kept from FR-13).
- `plan_media(container, vcodec, acodec) -> MediaPlan` (kept).
- `hls_mime(filename: &str) -> &'static str` - `.m3u8` / `.ts` / fallback `application/octet-stream`.
- `resolve_under_root(root: &Path, url_path: &str) -> Option<PathBuf>` - join + canonical containment
  check; `None` for traversal/absolute escapes. Security-critical.

## 6. Edge cases

- No video stream -> error (unchanged).
- ffmpeg never produces the first segment within a timeout (e.g. ~20s) -> error surfaced to the FE
  "Could not play this file" state; partial dir cleaned.
- Server request for a missing/not-yet-written segment -> 404 (AVPlayer retries; encoder is far
  ahead of realtime so it appears shortly).
- Seeking past the encoded point -> AVPlayer waits for that segment; encoder catches up fast. Known
  limit, acceptable.
- Path traversal / absolute path in a request URL -> rejected (AC-004).
- Rapid file switching -> each activation kills+cleans the prior job before starting a new one.
- App exit -> OS cleans temp; we also best-effort wipe the HLS root at startup.

## 7. Dependencies

- `tiny_http` (loopback server; sync, tiny, no async runtime needed).
- Bundled ffmpeg/ffprobe sidecars (already present); `CommandChild` has no `Drop`, so ffmpeg keeps
  running after `prepare_media` returns - reuses the detached-drain pattern from the pre-`d335287`
  streaming code.
- FR-12 logging (verification).

## 8. Risks

- Mixed content: app origin is `tauri://localhost`, media is `http://localhost:PORT`. `http://localhost`
  is "potentially trustworthy" per spec and CSP is `null`, so it should load - verify on device. If
  blocked, fall back to a custom `stream://` range protocol for a complete MP4 (slower start).
- Loopback server exposure: bind strictly to `127.0.0.1`, OS-random port, serve only the HLS root
  with traversal guard. No external interface.
- Disk: HLS segments for a long file ~ source size; temp only, cleaned on switch/exit.

## 9. AC traceability (implemented)

| AC | Proven by |
|----|-----------|
| AC-001 | `hls_mime` tests + `should_serve_m3u8_with_hls_mime_when_file_exists` (real loopback GET); `start` binds `127.0.0.1:0` |
| AC-002 | structural: `stream_hls` + `poll_first_segment` return on first segment, no ffmpeg-await; e2e-measured first segment ~88ms; FR-12 log (manual) |
| AC-003 | `prepare_media` Passthrough branch returns source path + `transcoded:false`, no server/encode |
| AC-004 | `resolve_under_root` tests (traversal/absolute/empty) + `should_return_404_when_request_escapes_root` |
| AC-005 | `stop_current_job` (kill + remove_dir_all), called at `stream_hls` start |
| AC-006 | unchanged `plan_media` tests (TC-001..TC-007) |
| AC-007 | `prepareMediaUrl` vitest: http URL unchanged (no convertFileSrc) + file path via convertFileSrc |

Status: implemented; gates green (42 cargo tests, 462 FE tests, clippy + fmt clean, verifier PASS on
all 7 ACs, no security escape). **On-device validation pending (user):** drop the MKV, confirm it
starts ~instantly and no mixed-content block in the webview console.
