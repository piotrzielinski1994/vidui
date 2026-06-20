# Plan: Bundle ffmpeg sidecar

Implements [spec.md](spec.md). TDD red-green-refactor. Branch: `20260620173011-bundle-ffmpeg-sidecar`.

## Approach

Swap the two PATH spawns in `media.rs` (`Command::new("ffprobe")`, `Command::new("ffmpeg")`)
for Tauri shell **sidecars** resolved next to the executable. The codec-decision logic and the
fragmented-MP4 streaming strategy are preserved unchanged - only the binary source moves from
PATH to bundled.

Key mechanics confirmed from Tauri docs + the `tauri-plugin-shell` 2.x source:

- **Resolution:** `app.shell().sidecar("ffmpeg")` resolves `<exe-dir>/ffmpeg-<triple>[.exe]` in
  both `tauri dev` and bundled runs. Pass only the bare name; the `-<triple>` suffix is matched
  by the plugin. This is why manual `current_exe()` path-joining is rejected - the plugin already
  handles dev vs bundle + triple + `.exe`.
- **Detach (AC-006):** `CommandChild` has **no `impl Drop`** and `kill()` consumes `self`, so
  dropping the child does NOT kill ffmpeg - the streaming transcode keeps encoding after
  `prepare_media` returns. Confirmed in plugin source.
- **Pipe-drain gotcha (NEW constraint the sidecar introduces):** `spawn()` force-pipes
  stdout/stderr into a `channel(1)`. The current bare-`Command` code lets ffmpeg inherit stderr;
  the sidecar does not. If nobody drains the receiver, ffmpeg can block writing diagnostics once
  the OS pipe buffer fills, stalling the background encode. **Mitigation:** spawn a detached task
  that drains `rx` to completion (discarding events) for the streaming transcode; for the
  synchronous probe use `.output().await` which drains internally.

### ffprobe is async now

`app.shell()` needs an `AppHandle`, and the sidecar API is async. `prepare_media` is already
`async`; it gains an `app: tauri::AppHandle` parameter (Tauri injects it - frontend call site
unchanged). `probe_stream` becomes `async fn probe_stream(app, path, stream)` using
`sidecar("ffprobe").args(..).output().await`.

### Two-phase ffmpeg spawn

Replace the `std::process::Command` spawn + `try_wait` loop with:
1. `app.shell().sidecar("ffmpeg").args(..).spawn()` -> `(rx, child)`.
2. Detach a drain task on `rx`.
3. Keep the existing "wait until `MIN_STREAM_BYTES` exist on disk, or timeout, or child
   terminated" loop - but read termination from a flag the drain task sets on
   `CommandEvent::Terminated`, instead of `child.try_wait()` (the plugin owns the child).
   On timeout, `child.kill()`.

## Files

### Create
- `scripts/fetch-ffmpeg.sh` - download pinned static `ffmpeg`+`ffprobe` for the 3 triples,
  verify SHA-256, unzip, place as `src-tauri/binaries/{ffmpeg,ffprobe}-<triple>[.exe]`, chmod +x.
  Idempotent (skips a triple whose binaries already verify). `curl -L` for BtbN's redirect.
  Sources (from research, all verified live 2026-06-20):
  - `aarch64-apple-darwin`: ffmpeg.martin-riedl.de arm64 8.1.1 (GPLv3), ffmpeg.zip + ffprobe.zip.
  - `x86_64-apple-darwin`: ffmpeg.martin-riedl.de amd64 8.1.1 (GPLv3), ffmpeg.zip + ffprobe.zip.
  - `x86_64-pc-windows-msvc`: BtbN `autobuild-2026-06-18-14-21` `ffmpeg-n8.1.2-win64-lgpl-8.1.zip`
    (LGPLv3), extract `bin/ffmpeg.exe` + `bin/ffprobe.exe`.
  SHA-256 captured on first real download (placeholder until then), then pinned in the script.

### Modify
- `src-tauri/Cargo.toml` - add `tauri-plugin-shell = "2"`.
- `src-tauri/src/lib.rs` - `.plugin(tauri_plugin_shell::init())`.
- `src-tauri/capabilities/default.json` - add `shell:allow-execute` for `binaries/ffmpeg` and
  `binaries/ffprobe`, both `sidecar: true`, `args: true` (file paths are dynamic).
- `src-tauri/tauri.conf.json` - `bundle.externalBin = ["binaries/ffmpeg","binaries/ffprobe"]`.
- `src-tauri/src/media.rs` - the refactor above; extract `is_directly_playable(vcodec, acodec)`
  as a pure fn so it's unit-testable without spawning anything.
- `.gitignore` (repo root) - add `src-tauri/binaries/`.
- `README.md` - new `scripts/fetch-ffmpeg.sh` step in setup; flip "Requires ffmpeg on PATH" /
  "bundled ffmpeg" TODO wording to done; note GPL-on-macOS.
- `docs/adr.md` - row: GPL-on-macOS / LGPL-on-Windows binary-source decision + pipe-drain note.
- `docs/learnings.md` - the two non-obvious gotchas (no-Drop detach; channel(1) drain).

## Tests (TDD)

Rust (`cargo test` in `src-tauri`), the layer that owns this behaviour:
- `is_directly_playable` returns true for `("h264","aac")`, `("h264","mp3")`, `("h264","")`;
  false for `("vp9","opus")`, `("av1","aac")`, `("h264","ac3")`, `("","")`. (AC-005)
- `cache_path` is deterministic for the same source and lands under a `vidui-transcode` temp dir
  with an `.mp4` suffix. (regression guard for the preserved helper)

Frontend: no behavioural change -> existing `npm test` must stay green (the `prepareMediaUrl`
seam and `PreparedMedia` shape are unchanged). No new JS tests.

Sidecar spawning / real playback is **not** unit-testable (needs a Tauri host + real binaries +
real media) -> covered by `cargo build` (wiring compiles) + user `npm start` verification.

## Acceptance verification

| AC | Verified by |
|----|-------------|
| AC-001 | grep: no `Command::new("ffmpeg"/"ffprobe")` in media.rs; `cargo build` |
| AC-002 | run `scripts/fetch-ffmpeg.sh`; binaries present + checksums match |
| AC-003 | `git check-ignore src-tauri/binaries/ffmpeg-aarch64-apple-darwin` |
| AC-004 | `cargo build` (capability + externalBin compile); config review |
| AC-005 | `cargo test` (is_directly_playable) |
| AC-006 | code review (drain task + no kill on return) + user `npm start` |
| AC-007 | **user `npm start` with PATH ffmpeg removed** - mp4 direct, MKV remux, WebM transcode |
| AC-008 | `npm run lint` + `npm run typecheck` + `npm test` + `cargo build` + `cargo test` |

## Risks

- **GPL macOS binary**: app inherits GPL obligations on distribution. Mitigation: documented +
  ADR; acceptable for personal/source-available; revisit before closed distribution.
- **Pinned URL rot**: Martin-Riedl/BtbN URLs could move. Mitigation: version-pinned immutable
  paths chosen (not "latest"); SHA-256 pinned so a silent swap fails loudly.
- **Pipe-buffer stall**: unaddressed, the detached encode could block. Mitigation: drain task
  (above). This is the one real behavioural-correctness risk of the sidecar swap.
- **Cross-platform unverifiable here**: only arm64 macOS is verifiable on-device. Mitigation:
  Windows/Intel binaries wired + acquired but flagged unverified until run on those machines.
- **Bundle size**: +~160MB/platform of binaries in the app bundle. Accepted (the standalone goal).

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-20 | Resolve sidecars via `tauri-plugin-shell` `app.shell().sidecar()`, not manual `current_exe()` path-join. | Plugin handles dev-vs-bundle dir, `-<triple>` suffix, and `.exe` - reimplementing is error-prone. |
| 2026-06-20 | macOS GPLv3 prebuilt + Windows LGPLv3 prebuilt (vs compiling LGPL macOS from source). | No off-the-shelf LGPL static macOS build exists; self-compiling is multi-hour/brittle and out of scope. User-approved trade-off. |
| 2026-06-20 | Drain the sidecar stdout/stderr `rx` in a detached task. | `spawn()` force-pipes to `channel(1)`; an undrained pipe can stall the background encode. Bare-`Command` (inherited stderr) didn't have this; the sidecar introduces it. |
| 2026-06-20 | Terminated-branch error condition is `!succeeded` only (read from `CommandEvent::Terminated` code). | Verifier caught a regression: an extra `\|\| file_len <= MIN` disjunct was always-true (top-of-loop `> MIN` break guarantees it), so it errored on every clean termination and made `succeeded` dead - a sub-256KB clean transcode wrongly errored. Dropping it restores the original `!success() && file<=MIN` semantics (equivalent given the early break). |

## Verification (final)

All gates green: `cargo build`, `cargo test` (12), `cargo clippy` (0), `npm run lint` (0 err),
`npm run typecheck`, `npm test` (200). Two fresh-context verifier passes; second confirmed the
loop-fix correct and observably equivalent to the original.

AC traceability:

| AC | Proof |
|----|-------|
| AC-001 | grep: no `Command::new`/PATH spawn in media.rs; both via `app.shell().sidecar(..)` |
| AC-002 | `scripts/fetch-ffmpeg.sh` - 3 triples, 6 SHA-256 pinned, idempotent; on-disk digests match |
| AC-003 | `git check-ignore src-tauri/binaries/...` passes; absent from `git status` |
| AC-004 | `externalBin` + `shell:allow-execute` capability; `cargo build` compiles |
| AC-005 | `media::tests::*` (7 codec-pair + 3 cache_path), all pass |
| AC-006 | code review (drain task + no-Drop detach + `MIN_STREAM_BYTES` return) - **+ user `npm start`** |
| AC-007 | **user `npm start`, PATH ffmpeg removed** - mp4 direct / MKV remux / WebM transcode (pending) |
| AC-008 | all gates above |

Status: code complete + machine-verified. **AC-006 / AC-007 need a user on-device `npm start`**
(real playback + standalone-without-PATH-ffmpeg are not sandbox-provable).
