# Spec: Bundle ffmpeg sidecar (standalone, zero PATH dependency)

**Version:** 0.1.0
**Created:** 2026-06-20
**Status:** Draft (awaiting approval)
**Implements:** FR-2 from `.pzielinski/todo.md`. Realises the standalone goal of
[../20260620004905-real-playback/spec-ffmpeg.md](../20260620004905-real-playback/spec-ffmpeg.md)
and the bundled-ffmpeg ADR row.

## 1. Overview / why

Today playback works only where `ffmpeg`/`ffprobe` are pre-installed on `PATH`
(`media.rs` calls bare `Command::new("ffmpeg")` / `Command::new("ffprobe")`). That
blocks any real distribution. This feature ships statically-linked `ffmpeg` +
`ffprobe` binaries **inside** the app as Tauri sidecars (`externalBin`) and resolves
them through the shell plugin, so the app runs with no system ffmpeg present.

The probe/decide/transcode pipeline does **not** change behaviourally - only the
*source* of the two binaries changes (PATH -> bundled sidecar).

## 2. Scope

In: Rust/Tauri sidecar wiring, binary acquisition, build config. Out: any change to
the codec-decision rules, the streaming-fragmented-MP4 strategy, the frontend
pipeline, or the transport UI.

## 3. Acceptance Criteria

| ID | Criterion | Priority | How verified |
|----|-----------|----------|--------------|
| AC-001 | `ffmpeg` + `ffprobe` are invoked via the Tauri shell **sidecar** (`app.shell().sidecar(..)`), not `Command::new("ffmpeg")` on PATH. No bare-name process spawn for either binary remains in `media.rs`. | Must | Code review + `cargo test` + grep |
| AC-002 | `scripts/fetch-ffmpeg.sh` downloads pinned static `ffmpeg`+`ffprobe` for all three triples (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-pc-windows-msvc`), verifies SHA-256, and places them as `src-tauri/binaries/{ffmpeg,ffprobe}-<triple>[.exe]`. Re-running is idempotent. | Must | Run script; checksums match |
| AC-003 | `src-tauri/binaries/` is gitignored - binaries are never committed. | Must | `git check-ignore` |
| AC-004 | `tauri.conf.json` declares `bundle.externalBin = ["binaries/ffmpeg","binaries/ffprobe"]`; the shell `allow-execute` capability permits both sidecars with dynamic args. | Must | Config review + `cargo build` |
| AC-005 | The codec-decision logic (`is_directly_playable`) is preserved exactly across the refactor and pinned by a Rust unit test. | Must | `cargo test` |
| AC-006 | A transcode/remux still **streams** (returns once `MIN_STREAM_BYTES` exist; ffmpeg keeps encoding in the background after the command returns - not killed on return). | Must | User-verified `npm start` + code review of detach |
| AC-007 | **Standalone:** with system ffmpeg/ffprobe removed from PATH, an H.264 mp4 plays directly, an H.264-in-MKV remuxes, and a VP9/WebM transcodes - all from the bundled binaries. | Must (gate) | **User-verified on macOS arm64 via `npm start`** (cannot be proven in sandbox) |
| AC-008 | `npm run lint`, `npm run typecheck`, `npm test`, and `cargo build` + `cargo test` all pass. | Must | CI gates |

## 4. UI States

No new UI. Existing probing/preparing/playing/error states are unchanged - this
feature only changes where the two binaries come from.

## 5. Surface

- `scripts/fetch-ffmpeg.sh` (new) - acquire + place binaries.
- `src-tauri/Cargo.toml` - add `tauri-plugin-shell = "2"`.
- `src-tauri/src/lib.rs` - register `tauri_plugin_shell::init()`.
- `src-tauri/capabilities/default.json` - add `shell:allow-execute` for both sidecars.
- `src-tauri/tauri.conf.json` - `bundle.externalBin`.
- `src-tauri/src/media.rs` - swap `std::process::Command` for `app.shell().sidecar(..)`;
  `prepare_media` gains an injected `app: tauri::AppHandle`; extract + test
  `is_directly_playable`.
- `.gitignore` - ignore `src-tauri/binaries/`.
- `README.md`, `docs/adr.md` - doc updates.

## 6. Licensing (decided)

No off-the-shelf **LGPL** static ffmpeg exists for macOS - every prebuilt static
macOS build (`ffmpeg.martin-riedl.de`, osxexperts) configures `--enable-gpl` with
x264/x265. Windows has a real LGPL static build (BtbN). Decision (user-approved):

- **macOS (arm64 + Intel):** GPLv3 static build, `ffmpeg.martin-riedl.de` 8.1.1.
- **Windows x64:** LGPLv3 static build, BtbN `autobuild-2026-06-18-14-21` 8.1.2.

Consequence: bundling GPL ffmpeg subjects the distributed app to GPL terms. Acceptable
for a personal / source-available player; revisit before any closed distribution.
Logged in ADR.

## 7. Out of scope

- Compiling an LGPL ffmpeg from source for macOS.
- Linux binaries (no current target).
- Signing / notarization of bundled binaries.
- Any change to codec decisions, streaming strategy, or UI.

## 8. Verification

`cargo test` pins `is_directly_playable` + `cache_path` determinism. `cargo build`
proves the sidecar wiring + capability compile. The **standalone playback** ACs
(AC-006, AC-007) are user-verified on-device via `npm start` with PATH ffmpeg
removed - not provable in this sandbox. Every "plays" claim comes from a user run.

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-20 | Initial draft |
