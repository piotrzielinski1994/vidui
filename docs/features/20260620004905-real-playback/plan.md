# Plan: Real Playback (open files, working transport, fullscreen)

Implements [spec.md](spec.md). TDD red-green-refactor. Branch: `20260620004905-real-playback`.

## Approach

- **IPC boundary**: every Tauri call lives in `src/lib/tauri.ts` (`openVideoFiles`,
  `toAssetUrl`, `toggleFullscreen`). Tests mock this module - never the system under test.
- **Playlist becomes state**: `WorkspaceProvider` already takes `videos` as a prop; flip it to
  the *initial* value of a `videos` state field (default `[]`), add `loadVideos` to replace it.
  Active/selection/play logic already exists - extend `selectNode`/`stepVideo` to set
  `isPlaying = true` (auto-play).
- **Live playback state**: context owns `playbackCurrentSec` / `playbackDurationSec`; the
  `<video>` element pushes them up via `reportProgress` (`onTimeUpdate`) + `loadedmetadata`,
  and `reportEnded` (`onEnded` -> pause). Switching active video resets both to 0.
- **Element control**: `Viewport` holds a `ref` to the `<video>`; an effect syncs
  `isPlaying` -> `play()`/`pause()` and sets `src` from `toAssetUrl(activeVideo.path)`.
- **Fullscreen**: `onDoubleClick` on the viewport region calls `toggleFullscreen()`.
- **Pure helper** `videosFromPaths` (path -> VideoNode) is unit-tested in isolation.

## Files

### Create
- `src/components/workspace/videos-from-paths.ts` - pure path->VideoNode[] mapper.
- `src/components/workspace/__tests__/videos-from-paths.test.ts` - unit tests (RED).

### Modify
- `src/lib/tauri.ts` - add `openVideoFiles`, `toAssetUrl`, `toggleFullscreen`.
- `src/components/workspace/mock-data.ts` - `VideoNode` gains `path`, loses `resolution`/`durationSec`; `mockVideos` -> empty default (or rename). Keep `VideoFormat`.
- `src/components/workspace/workspace-context.tsx` - `videos` state + `loadVideos`; playback state (`playbackCurrentSec/DurationSec`, `reportProgress`, `reportEnded`); auto-play on select/step/load; reset playback on active change.
- `src/components/workspace/viewport.tsx` - real `<video>` (ref, src, events) + `onDoubleClick` fullscreen.
- `src/components/workspace/transport-bar.tsx` - readout + progressbar from live playback state.
- `src/lib/shortcuts/registry.ts` - add `open-files` action (`Mod+O`).
- `src/components/workspace/workspace.tsx` - wire `open-files` handler -> `openVideoFiles()` + `loadVideos(videosFromPaths(...))`.
- `src-tauri/src/lib.rs` - register `tauri_plugin_dialog`.
- `src-tauri/Cargo.toml` - `tauri-plugin-dialog = "2"`.
- `src-tauri/capabilities/default.json` - `dialog:default`, `core:window:allow-set-fullscreen`, `core:window:allow-is-fullscreen`.
- `src-tauri/tauri.conf.json` - enable `app.security.assetProtocol` + scope.
- `package.json` - `@tauri-apps/plugin-dialog`.
- Existing tests touching `VideoNode` mock fields (`fixtures.ts`, `viewport.test.tsx`, `transport-bar.test.tsx`, etc.) updated to the new shape.

### Test mock
- `src/test/setup.ts` or per-test: stub `HTMLMediaElement.prototype.play/pause/load` (jsdom lacks them) - no-op returning a resolved promise for `play`.

## Execution order

1. **RED** (test-writer subagent): tests for `videosFromPaths`, context (`loadVideos`/auto-play/playback state), viewport (`<video>` src + double-click fullscreen via mocked tauri), transport (live readout/progress), registry (`open-files`), workspace (open flow wires picker->loadVideos). All fail.
2. **GREEN**: helper -> mock-data shape -> tauri.ts -> context -> viewport -> transport -> registry -> workspace. One commit per AC.
3. Rust/config (Cargo, lib.rs, capabilities, tauri.conf, package.json) - not unit-tested in JS; `cargo test` stays green (greet unchanged). Verify build compiles.
4. **REFACTOR**: tidy, keep green.
5. **VERIFY**: fresh verifier subagent; lint/typecheck/test; manual `npm start` smoke for real playback + fullscreen.

## Edge cases (from spec)

E-1 cancel -> `[]` -> skip `loadVideos`. E-2 empty playlist no-ops. E-3 unknown duration -> `--:--`/0, max 0. E-4 single-file wrap. E-5 unknown ext -> default `MP4`. E-6 end -> pause. E-7 re-select active -> stays + plays. E-8 sort while playing -> active unchanged.

## Tests to write (>= 1 per AC)

- AC-001 registry has `open-files`/`Mod+O`; AC-001/002 workspace open flow replaces+activates+plays; AC-003 cancel no-op; AC-004 viewport `<video>` src vs placeholder; AC-005 play/pause drives element + icon; AC-006 live readout; AC-007 progressbar aria + fill; AC-008 next/prev wrap+autoplay; AC-009 row click play; AC-010 double-click toggles fullscreen (mock); AC-011 empty no-op; AC-012 gates.
- Helper unit tests: basename, ext->format, unknown ext default, multiple, empty.

## Acceptance verification

Verifier subagent (fresh context) maps every AC -> test, runs lint/typecheck/test, probes edge cases. Manual: `npm start`, open real files, confirm playback + working transport + double-click fullscreen.

### Status: DONE (verifier PASS, all gates green)

Gates: `npm test` 134 pass (14 files), `npm run typecheck` clean, `npm run lint` 0 errors (3 accepted react-refresh warnings), `cargo test` 2 pass. Manual `npm start` smoke still recommended for real pixel playback + native fullscreen (jsdom can't exercise those).

### AC -> test traceability

| AC | Test(s) |
|----|---------|
| AC-001 | `registry.test.ts` "...'open-files' action bound to Mod+O"; `workspace-open-files.test.tsx` "...list an 'Open files' command" + "...call openVideoFiles once"; `tauri.test.ts` "...multiple selection enabled" |
| AC-002 | `workspace-open-files.test.tsx` "...replace the playlist..." + "...activate and play the first..."; `workspace-context.test.tsx` "...loadVideos..."; `videos-from-paths.test.ts` "...preserve the input order" |
| AC-003 | `workspace-open-files.test.tsx` "...leave an existing active video unchanged if cancelled"; `tauri.test.ts` "...empty array if cancelled" |
| AC-004 | `viewport.test.tsx` "...render a video element", "...source the video from the asset url", "...no-video placeholder and no video element" |
| AC-005 | `transport-bar.test.tsx` "...switch the play button to pause and back" |
| AC-006 | `transport-bar.test.tsx` "...00:30 / 01:00 if progress...", "...--:-- / --:-- if no video", "...00:00 / 00:00 if no progress" |
| AC-007 | `transport-bar.test.tsx` "...aria-valuenow 30 and aria-valuemax 60", "...valuenow 0 and valuemax 0" |
| AC-008 | `transport-bar.test.tsx` next/prev/wrap/sorted; `workspace-context.test.tsx` "...isPlaying true if nextVideo/prevVideo" |
| AC-009 | `video-list.test.tsx` row-click activates; `workspace-context.test.tsx` "...isPlaying true if a node is selected" |
| AC-010 | `viewport.test.tsx` "...toggleFullscreen once if double-clicked"; `tauri.test.ts` enter/exit fullscreen |
| AC-011 | `workspace-palette.test.tsx` next no-active no-op; `transport-bar.test.tsx` empty readout; `viewport.test.tsx` placeholder |
| AC-012 | all gates green |

## Risks

- jsdom no real media: assert observable state + mocked IPC, not pixels. Manual smoke covers real playback.
- Asset-protocol broad scope (`**`) to serve arbitrary picked files: security trade-off, logged in ADR.
- `setFullscreen` needs window capability; double-click handler must not fire on single-click selection (use `onDoubleClick`, separate from row select).
