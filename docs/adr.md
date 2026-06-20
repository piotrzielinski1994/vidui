# Architectural Decisions - vidui

Append-only log of architectural and design decisions made during development.

## Format

Each entry follows this structure:

| Date | Decision | Rationale |
|------|----------|-----------|
| {YYYY-MM-DD} | {What was decided} | {Why this choice was made} |

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-19 | Bootstrap stack = Tauri 2 + React 19/TS + Vite + TanStack Router/Query/Hotkeys + shadcn/Tailwind v4 + Vitest. Mirrors sibling repo `requi` but **drops TanStack Table & Form**. | A video player is keyboard-driven (Hotkeys), needs routing (Router) and async/IPC state (Query), but has no data-grid or multi-field-form surface. Carrying Table/Form would be unused deps (YAGNI). Add them only when a feature needs them. |
| 2026-06-19 | Code-based TanStack routes (not file-based). | Fewer build plugins; matches `requi`. |
| 2026-06-19 | Pure scaffold - no real `<video>` playback in bootstrap. | Keeps bootstrap = tooling foundation only; first playback feature lands separately so scaffold and feature concerns stay unmixed. |
| 2026-06-20 | Real playback feature: playlist is built from native-picker file paths and **replaces** prior list (no append, no persistence); app boots with an empty playlist (mock data dropped from the default). | Simplest real-player model; matches "open these files, watch them" intent. Append/persistence are separable later features (YAGNI). |
| 2026-06-20 | Playback follows selection: opening files, clicking a row, and prev/next all **auto-play**. `isPlaying` stays a distinct field but those verbs set it true. | User chose auto-play; keeps selection vs play-state separable in the model while giving instant playback UX. |
| 2026-06-20 | Live playback figures (current/duration) live in `WorkspaceProvider` state, pushed up from the `<video>` element's `timeupdate`/`loadedmetadata` events - not stored on `VideoNode`. | Element is the source of truth for time; storing on the node would duplicate/desync. Context already owns UI state (no prop drilling). |
| 2026-06-20 | All Tauri IPC for this feature funnels through `src/lib/tauri.ts` (`openVideoFiles`, `toAssetUrl`, `toggleFullscreen`). | Single mockable boundary; tests stub this module instead of the system under test, keeping jsdom (no real media/IPC) viable. |
| 2026-06-20 | Fullscreen = **native window** fullscreen via Tauri `setFullscreen`, triggered by viewport double-click only (no hotkey/palette command). | User chose native window over the browser Fullscreen API; double-click is the requested gesture. |
| 2026-06-20 | `VideoNode` drops `resolution`/`durationSec`; `SortField` drops the matching `duration`/`resolution` keys (kept only `title`/`type`). | Picker-sourced files have no upfront metadata; duration is live from the `<video>` element. The dropped sort keys were UI-unreachable (the selector only ever exposed Title/Type) - removing them deletes dead code rather than feature. |
| 2026-06-20 | Universal playback needs a real engine, but the **mpv-embed approach was tried and abandoned**. mpv renders into a GPU surface under a *transparent* webview; on macOS that transparency broke the whole window (chrome bled through) and the embed plugin (`tauri-plugin-libmpv`) is Windows-tested / macOS-untested. Reverted to the working `<video>` player. | The render-API-under-transparent-webview compositing is the fragile part on macOS (Stremio had to hand-write their own macOS render integration). Too high-risk/multi-day for the value; chose the simpler standalone path instead (next row). |
| 2026-06-20 | Universal playback via a **bundled ffmpeg sidecar**: the webview `<video>` stays the renderer; ffmpeg (one statically-linked binary shipped inside the app, like VLC bundles libvlc) remuxes/transcodes any input to a webview-playable stream. | Standalone (zero external installs) was a hard requirement. A single bundled binary is far simpler + lower-risk than embedding a media engine + 22 dylibs under a transparent window. Trade-off: VP9/AV1/HEVC need a transcode step (latency); remuxable containers (MKV/AVI/H.264) are near-instant. See [spec-ffmpeg.md](features/20260620004905-real-playback/spec-ffmpeg.md). |
| 2026-06-20 | ffmpeg/ffprobe **bundled as Tauri sidecars** (`externalBin` + `tauri-plugin-shell` `app.shell().sidecar()`), not resolved via manual `current_exe()` path-joining. Binaries fetched by `scripts/fetch-ffmpeg.sh` (SHA-256 pinned, gitignored, not committed). | Realises the standalone goal (zero PATH install). The shell plugin already handles dev-vs-bundle dir + `-<triple>` suffix + `.exe`; reimplementing that resolution is error-prone. Fetch-not-commit keeps ~1GB of binaries out of git. |
| 2026-06-20 | Bundled binary licensing: **macOS = GPLv3** (ffmpeg.martin-riedl.de 8.1.1), **Windows = LGPLv3** (BtbN 8.1.2). | No off-the-shelf LGPL *static* macOS ffmpeg exists - every prebuilt static macOS build configures `--enable-gpl` with x264/x265. Self-compiling an LGPL macOS build is multi-hour/brittle and out of scope. Consequence (user-accepted): the distributed app inherits GPL terms on macOS; fine for a personal/source-available player, revisit before any closed distribution. |
| 2026-06-20 | The streaming-transcode loop drains the sidecar stdout/stderr receiver in a detached task and reads termination from `CommandEvent::Terminated` (not `child.try_wait()`). | `tauri-plugin-shell` `.spawn()` force-pipes into a `channel(1)`; an undrained pipe stalls the background encode once the OS buffer fills. The bare `std::process::Command` it replaced inherited stderr and had no such constraint - the sidecar introduces it. |
| 2026-06-20 | Asset protocol enabled with a **broad local scope** so arbitrary user-picked files can be served to the `<video>` element. | A general file picker can return any path; a narrow scope would block legitimate selections. Trade-off: broad read exposure via the asset protocol, acceptable for a local single-user desktop player. Revisit if multi-window/remote content is ever added. |
