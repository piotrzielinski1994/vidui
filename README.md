# VidUI

A minimal, keyboard-driven desktop video player.

Built as a Tauri 2 desktop app with a React 19 + TypeScript frontend on the TanStack
stack (Router, Query, Hotkeys) and shadcn/ui + Tailwind v4.

## Prerequisites

- **Node.js** - version pinned in [.nvmrc](.nvmrc). Run `nvm use` before any npm command.
- **Rust** stable toolchain (`rustc`, `cargo`).
- **Tauri OS prerequisites** - platform-specific system libraries (WebKitGTK on Linux,
  Xcode CLT on macOS, WebView2 + Build Tools on Windows). See
  https://tauri.app/start/prerequisites/

If the Rust toolchain or system prerequisites are missing, `npm start` fails fast with
a build error from Cargo.

## Setup

```bash
nvm use
npm install
scripts/fetch-ffmpeg.sh   # download the bundled ffmpeg/ffprobe sidecars (required before any build)
```

`scripts/fetch-ffmpeg.sh` downloads statically-linked `ffmpeg`+`ffprobe` for all
supported targets into `src-tauri/binaries/` (gitignored, SHA-256 pinned). `cargo`
fails to build without the binary for your host triple present. macOS binaries are
GPLv3, Windows is LGPLv3 - see [docs/adr.md](docs/adr.md).

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Launch the desktop app (`tauri dev`) - native window + Vite dev server. |
| `npm run dev` | Frontend-only Vite dev server (browser, no native shell). |
| `npm run build` | Typecheck + production frontend build (`dist/`). |
| `npm run tauri build` | Produce a native desktop bundle. |
| `npm run lint` | ESLint (flat config). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run format` | Prettier write. |
| `npm test` | Frontend behavior tests (Vitest, run once). |
| `npm run test:watch` | Vitest in watch mode. |

Rust backend tests: `cd src-tauri && cargo test`.

> The home route renders the **player workspace shell**: a resizable layout with a flat
> playlist sidebar (the open video files, one row each, with a sort toggle in the header),
> a video viewport, and a transport bar (prev / play-pause / next + a live time readout, with
> a seekable progress bar across the bar's top edge - click or drag to scrub). It boots with an empty playlist:
> `Open files` (`Mod+O`, or the command palette) opens the native picker (filtered to
> `mp4/mkv/mov/webm/avi`) and **replaces** the playlist with the chosen files, auto-playing the
> first. **Drag & drop:** dropping video files (or folders, recursed) from Finder/Explorer onto
> the window **appends** them to the playlist - a Rust `expand_dropped_paths` command walks the
> dropped paths, recurses folders, keeps only known video extensions, dedupes and sorts; a
> full-window overlay shows while a drag hovers. Dropping onto an empty list activates+plays the
> first imported video (drop never disturbs an already-playing video). The viewport renders a real `<video>`; play/pause, prev/next, and clicking a row all
> drive playback. Spacebar toggles play/pause. **Universal playback:** every opened file is probed
> by a Rust `prepare_media` command (ffprobe reads container + codecs); H.264/AAC already in an
> MP4/MOV plays directly via the asset protocol. Anything else **streams as HLS** so playback
> starts almost immediately (like VLC) instead of waiting for a full transcode: ffmpeg writes an
> HLS playlist + segments progressively into a temp dir, a tiny loopback HTTP server (127.0.0.1)
> serves them, and the webview's native HLS player starts on the first segment (~0.1s) while the
> encoder races ahead - copying streams that are already fine (`-c:v copy`) and re-encoding only
> what the webview can't decode (VP9/AV1/HEVC/Opus). There is no persistent cache: each playback
> streams fresh and is cleaned up when the file changes or the app exits. Single-clicking the viewport toggles
> play/pause; double-clicking it (or the green button /
> F11) enters fullscreen, which hides the chrome (sidebar, transport, overlay) and restores the
> pre-fullscreen visibility on exit. **ffmpeg/ffprobe are bundled** as Tauri sidecars
> (fetched by `scripts/fetch-ffmpeg.sh`) - the app is standalone, no system PATH install needed
> (see [docs/features/20260620173011-bundle-ffmpeg-sidecar](docs/features/20260620173011-bundle-ffmpeg-sidecar/)).
> The sort control toggles ascending/descending with natural numeric ordering (a
> numeric filename prefix sorts by value, so `3` precedes `21`). All UI + playback state (selection,
> active video, play/pause, live current/duration, sort direction, fullscreen) is shared via a
> `WorkspaceProvider` context (no prop drilling). The `greet` Tauri command stays wired as the IPC proof for later use. A `Mod+K` command
> palette (cmdk) lists the workspace actions (open files, play/pause, next, prev, relative seek,
> volume up/down, mute, speed up/down, toggle shuffle, cycle repeat, toggle sort, toggle sidebar,
> toggle transport bar, toggle fullscreen, toggle reveal-on-hover, rotate, cycle fit mode, zoom
> in/out, reset viewport, open settings) - every runnable
> action is in the palette, and entries carry search keywords (e.g. "bottom bar" finds the transport
> toggle); each action also has its own global hotkey (fullscreen `Mod+Shift+F`, reveal toggle `Mod+Shift+H`). **Extended transport:** arrows seek the active video
> (Left/Right ±5s, Shift+Left/Right ±1s), Up/Down adjust volume (±5%) and `M` mutes (mute button +
> volume slider in the transport bar), `[`/`]` step playback speed by 0.1x within 0.5x-2x (a rate
> readout shows in the bar only when off 1x). **Queue playback:** when a video ends it auto-advances
> to the next; a repeat control (`R`, off -> all -> one) loops the list or replays one, and a shuffle
> toggle (`S`) plays a stable shuffled order that drives both auto-advance and next/prev. With repeat
> off, the last video's end stops playback (no wrap); repeat-all wraps. Both are buttons in the
> transport bar. **Viewport transforms:** `Mod+Shift+R` rotates the video 90° (cycles back to 0),
`F` cycles how it fits its frame (contain -> cover -> fill), `=`/`-` zoom in/out by 0.1x within
1x-4x (centered), and `Mod+0` resets all three; a transform readout shows in the bar only when
off-default. They are session-sticky (persist across video switches, reset on app restart).
**User settings:** a `/settings` screen (`Mod+,`, or the palette; `Escape`/Back
> returns) lists every action with its binding and lets you **rebind any hotkey** by recording a
> new combination (conflicts are rejected and named, Reset reverts to default). Settings persist to
> disk via `tauri-plugin-store` and restore on next launch: the remapped hotkeys plus playback
> defaults (volume, mute, speed), UI defaults (sidebar/transport visibility, sort direction), and
> the resizable sidebar/content split sizes. A **reveal-transport-on-hover** toggle (on by default)
> shows a hidden transport bar as a bottom-edge overlay while the mouse moves over the video; it
> auto-hides after ~3s of no movement (but stays put while the cursor is on the bar) and reappears
> on the next move. The playlist and queue modes still reset on reload.
> **Logging:** each launch writes a fresh `vidui-<YYYYMMDDHHMMSS>.log` to the OS app-log dir
> (macOS `~/Library/Logs/com.pzielinski.vidui/`); `prepare_media` records each file's container,
> codecs, chosen plan, cache HIT/MISS and elapsed ms there (see
> [docs/features/20260621115143-file-logging](docs/features/20260621115143-file-logging/)).
> Not yet: subtitles, playlist persistence.

## Repo layout

```
index.html              Vite entry HTML
src/
  main.tsx              React entry: providers + RouterProvider
  router.tsx            Code-based TanStack Router assembly
  app/providers.tsx     QueryClientProvider + HotkeysProvider
  routes/               __root (layout + 404), index (player workspace + settings-persistence bridge), settings (remappable-hotkeys screen)
  components/
    workspace/          player shell: context, flat video-list, sort-natural, viewport (real video), transport bar, videos-from-paths, command palette, drop-overlay (drag-drop import)
    settings/           settings screen: shortcuts-section + shortcut-row (capture-keystroke rebind), playback-section (reveal-transport-on-hover toggle)
    ui/                 shadcn primitives (button, badge, scroll-area, resizable, command, dialog, switch)
  lib/                  tauri.ts (typed invoke wrappers), utils.ts (cn), shortcuts/ (action registry + resolve overrides + global hotkeys), settings/ (Settings ADT + merge, tauri-plugin-store persistence, SettingsProvider)
  index.css             Tailwind v4 + theme tokens
  test/setup.ts         Vitest + Testing Library setup
src-tauri/              Rust desktop shell: greet, media.rs (ffprobe/ffmpeg prepare_media via bundled sidecars - HLS-streams unplayable files, logs plan/timing), hls_server.rs (loopback HTTP server serving the HLS temp dir to the webview's native player), import.rs (expand_dropped_paths - folder-walk + ext filter for drag-drop), focus.rs (WKWebView first-responder fix), logging.rs (per-launch log filename), binaries/ (gitignored ffmpeg sidecars), tauri.conf.json
scripts/                fetch-ffmpeg.sh (download bundled ffmpeg/ffprobe sidecars)
tests/e2e/              Behavior smoke tests
docs/                   spec/plan per feature, ADR, learnings
```
