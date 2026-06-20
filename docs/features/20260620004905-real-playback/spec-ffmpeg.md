# Spec: Universal Playback via bundled ffmpeg sidecar

**Version:** 0.1.0
**Created:** 2026-06-20
**Status:** Draft (awaiting approval)
**Extends:** [spec.md](spec.md). Supersedes the abandoned mpv-embed attempt (see [adr.md](../../adr.md)).

## 1. Why / context

The webview `<video>` only decodes codecs the OS webview supports - on macOS WKWebView that
excludes file-based WebM/VP9, MKV, AVI. Requirement: **play every format, standalone (zero
external installs), Windows + macOS.** The mpv-embed path was tried and reverted (transparent-
window compositing broke macOS; plugin macOS-untested). This spec uses **ffmpeg** instead.

## 2. Approach

Keep the webview `<video>` as the renderer. Bundle a **statically-linked ffmpeg binary** inside
the app (the way VLC bundles libvlc - no system install). When a file is opened:

1. **Probe** it (ffprobe/ffmpeg) for container + video/audio codecs.
2. **Decide** per file:
   - **Directly playable** (e.g. H.264+AAC mp4/mov) -> play as today, no ffmpeg.
   - **Remuxable** (compatible codecs, wrong container - e.g. H.264 in MKV) -> ffmpeg
     `-c copy` into fragmented MP4. Near-instant (no re-encode), streamed to `<video>`.
   - **Must transcode** (VP9/AV1/HEVC/etc the webview can't decode) -> ffmpeg transcodes to
     H.264+AAC. Slower (CPU-bound); show a "preparing" state.

ffmpeg is invoked as a **Tauri sidecar** (`externalBin`), output served to `<video>` (file or
local stream). This keeps the existing UI/playlist/transport untouched - only the
viewport's source pipeline changes.

### Open design questions (resolve before/while planning)

- **Transcode delivery:** transcode-to-temp-file (simple, but whole-file wait) vs
  pipe/HLS-segment stream (play-as-it-encodes, more complex). Spike will pick.
- **Seeking in transcoded files:** non-trivial if streaming; temp-file makes seek free.
- **ffmpeg binary source:** which static build per platform (arm64+x64 macOS, x64 Windows),
  license (ffmpeg is LGPL/GPL depending on build - must pick an LGPL build for bundling),
  binary size (~30-80MB) added to the app.

## 3. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-000 | **Spike (go/no-go):** a bundled ffmpeg sidecar runs from the app and remuxes/transcodes one VP9 `.webm` to something the `<video>` plays - user-verified via `npm start`. Gates the rest. | Must (gate) |
| AC-001 | A directly-playable H.264 mp4/mov plays with NO ffmpeg pass (fast path unchanged) | Must |
| AC-002 | An H.264-in-MKV/AVI plays via remux (`-c copy`), near-instant | Must |
| AC-003 | A VP9/WebM file (the one that black-screened) plays (transcode if needed) | Must |
| AC-004 | A "preparing/transcoding" state shows while ffmpeg works; errors surface, no silent black | Must |
| AC-005 | App is **standalone** - plays all the above with NO system ffmpeg/mpv installed (bundled binary only) | Must |
| AC-006 | Transport (play/pause, seek, prev/next, time readout) works for played files | Must |
| AC-007 | Works on macOS (now) and Windows (tracked/verified) | Must |
| AC-008 | `npm run lint`, `npm run typecheck`, `npm test`, `cargo build` all pass | Must |

## 4. UI States

| State | Behavior |
| --- | --- |
| Empty | No active file -> placeholder. |
| Probing | File opened, deciding pipeline -> brief "analyzing" (or instant for fast path). |
| Preparing | Transcoding -> "Preparing <name>..." with the engine working (optionally progress %). |
| Playing | `<video>` plays the direct/remuxed/transcoded source; transport live. |
| Error | ffprobe/ffmpeg fails or file unsupported -> actionable message, no crash. |

## 5. Surface (sketch - refined in plan)

- Rust: an `externalBin` ffmpeg + Tauri commands `probe_media(path)` ->
  `{ container, vcodec, acodec, decision }`, and `prepare_media(path)` -> a playable
  URL/path (direct | remuxed temp | transcoded temp/stream). Cleanup of temp artifacts.
- JS (`@/lib/media.ts`): `prepareForPlayback(path): Promise<{ src, status }>`; the viewport
  sets `<video>.src` to the result. Single mockable seam (replaces raw `toAssetUrl` for video).

## 6. Out of scope

- Subtitle/audio-track selection, volume/speed UI.
- Streaming URLs / yt-dlp.
- Hardware-accelerated transcode tuning (correctness first).
- Distribution signing/notarization of the bundled binary (dev-run first).

## 7. Verification

jsdom tests cover wiring (probe decision logic, viewport sets the prepared src, states) against
a mocked `@/lib/media`. **Real playback + the bundled binary running are user-verified on-device
via `npm start`** - NOT provable in this sandbox. Every "plays" claim comes from a user run.

## 8. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-20 | Initial draft - ffmpeg sidecar after mpv-embed abandoned |
