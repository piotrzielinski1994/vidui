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
```

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
> a video viewport, and a transport bar (prev / play-pause / next + a time readout, with
> the inert progress indicator drawn as the bar's top border). It is driven by mock data
> with no real playback - playback, a real open-file flow, and persistence arrive as later
> features. The sort control toggles ascending/descending with natural numeric ordering (a
> numeric filename prefix sorts by value, so `3` precedes `21`). All UI state (selection,
> active video, play/pause, sort direction) is shared via a `WorkspaceProvider` context (no
> prop drilling). The `/settings` route still exists (no in-UI link yet); the `greet` Tauri
> command stays wired as the IPC proof for later use. A `Mod+K` command palette (cmdk) lists
> the workspace actions (play/pause, next, prev, toggle sort, toggle sidebar, toggle transport
> bar); each action also has its own global hotkey. Bindings are fixed defaults - no user
> remapping or persistence yet (panel visibility resets on reload).

## Repo layout

```
index.html              Vite entry HTML
src/
  main.tsx              React entry: providers + RouterProvider
  router.tsx            Code-based TanStack Router assembly
  app/providers.tsx     QueryClientProvider + HotkeysProvider
  routes/               __root (layout + 404), index (player workspace), settings
  components/
    workspace/          player shell: context, flat video-list, sort-natural, viewport, transport bar, mock data, command palette
    ui/                 shadcn primitives (button, badge, scroll-area, resizable, command, dialog)
  lib/                  tauri.ts (typed invoke wrappers), utils.ts (cn), shortcuts/ (action registry + global hotkeys)
  index.css             Tailwind v4 + theme tokens
  test/setup.ts         Vitest + Testing Library setup
src-tauri/              Rust desktop shell (greet command, tauri.conf.json)
tests/e2e/              Behavior smoke tests
docs/                   spec/plan per feature, ADR, learnings
```
