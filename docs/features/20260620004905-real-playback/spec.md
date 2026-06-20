# Spec: Real Playback (open files, working transport, fullscreen)

**Version:** 0.1.0
**Created:** 2026-06-20
**Status:** Draft

## 1. Overview

Turn the player shell from a mock-data mockup into a real video player. Three coupled
capabilities land together (they depend on each other - no point splitting):

1. **Open files** - a new registry action (`Open files`, `Mod+O`) opens the native file
   picker (Tauri dialog plugin) filtered to video files. The selected files **replace** the
   playlist (the app boots with an empty playlist; mock data is removed from the default).
2. **Real playback** - the viewport renders a real `<video>` element sourced from the local
   file via the Tauri asset protocol (`convertFileSrc`). The transport bar **actually works**:
   play/pause drives the element, the time readout shows live current/total time, and the
   progress bar reflects real progress. prev/next switch + auto-play the adjacent entry.
3. **Fullscreen** - double-clicking the viewport toggles **native window** fullscreen
   (Tauri `setFullscreen`); double-clicking again exits.

Playback model: **auto-play**. Opening files plays the first; selecting a playlist row (or
prev/next) makes it active and starts it playing. Selection and "is playing" stay distinct
state fields, but `selectNode`/`loadVideos`/`stepVideo` set `isPlaying = true`.

What this delivers:
- `Open files` action in the shortcut registry -> global hotkey + command-palette entry
  (no on-screen button - keyboard-driven per project ethos).
- Native file picker filtered to `mp4, mkv, mov, webm, avi`; cancel is a safe no-op.
- Runtime playlist state in `WorkspaceProvider` (was a static prop) replaced on each open.
- Real `<video>` in the viewport; live playback state (current sec, duration sec) owned by
  the context and pushed up from the element's `timeupdate` / `loadedmetadata` events.
- Transport time readout + progress bar driven by live playback state.
- Double-click viewport -> toggle native window fullscreen.

What this does **not** deliver (out of scope):
- No seekable progress bar (click/drag to jump) - the bar is read-only reflection.
- No volume / speed / mute / subtitle controls.
- No auto-advance to the next video on natural end (end -> pause; user steps manually).
- No playlist persistence / recent-files / drag-drop import.
- No metadata sidecar (resolution/duration shown live from the element only; the playlist row
  still shows just name + format badge as today).
- No fullscreen hotkey / palette command (double-click only, as requested).

### User Story

As a user, I want to open my video files, watch them play with a working transport bar, and
double-click to go fullscreen, so the app is a real player rather than a mock.

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A new `Open files` action (`Mod+O`) exists in the registry; it appears in the command palette and is bound as a global hotkey. Running it opens the native file picker filtered to video files (`mp4, mkv, mov, webm, avi`) | Must |
| AC-002 | Choosing one or more files **replaces** the playlist with those files (in chosen order, then current sort); the first becomes the active video and starts playing | Must |
| AC-003 | Cancelling the picker (no selection) leaves the current playlist, active video, and play state unchanged and throws nothing | Must |
| AC-004 | When a video is active, the viewport renders a real `<video>` element whose source resolves to the file via the asset protocol; with no active video the placeholder ("No video selected") is shown | Must |
| AC-005 | The play/pause button and `Mod+P` actually play/pause the active `<video>` element; the button icon reflects the current play state | Must |
| AC-006 | The transport time readout shows the active video's **live** current time / total duration sourced from the element (e.g. updates on `timeupdate`, total set on `loadedmetadata`); `--:-- / --:--` when nothing is active | Must |
| AC-007 | The progress bar reflects real progress: `aria-valuenow` = current sec, `aria-valuemax` = duration sec, and the fill width = `current / duration` (0 when duration unknown) | Must |
| AC-008 | prev / next (`Mod+Left` / `Mod+Right`, buttons, palette) switch the active video to the adjacent entry in the **current sorted order**, wrapping around, and auto-play it | Must |
| AC-009 | Clicking a playlist row makes that video active and auto-plays it | Must |
| AC-010 | Double-clicking the viewport toggles native window fullscreen: enters if windowed, exits if already fullscreen | Must |
| AC-011 | With an empty playlist / no active video: the open command still works, the transport controls are safe no-ops (no throw), and the viewport shows the placeholder | Must |
| AC-012 | `npm run lint`, `npm run typecheck`, and `npm test` exit 0 | Must |

## 3. User Test Cases

### TC-001: Open files replaces the playlist and auto-plays the first
**Precondition:** Workspace loaded, playlist empty.
**Steps:** Run `Open files` (palette or `Mod+O`); the picker returns two files.
**Expected:** The playlist shows exactly those two rows; the first is active, the viewport shows its `<video>`, and the play button shows the pause affordance (playing).
**Maps to:** AC-001, AC-002, AC-004, AC-005.

### TC-002: Cancel the picker
**Precondition:** A playlist with an active, playing video.
**Steps:** Run `Open files`; cancel the dialog (returns nothing).
**Expected:** Playlist, active video, and play state are unchanged; no error.
**Maps to:** AC-003.

### TC-003: Play / pause drives the element
**Precondition:** A video is active and playing.
**Steps:** Click play/pause (or `Mod+P`) twice.
**Expected:** The `<video>` pauses then plays; the button toggles pause<->play accordingly.
**Maps to:** AC-005.

### TC-004: Live time readout + progress
**Precondition:** A video is active; duration known (metadata loaded), currently at 30s of 60s.
**Steps:** Observe the transport bar.
**Expected:** Readout shows `00:30 / 01:00`; progress bar `aria-valuenow=30`, `aria-valuemax=60`, fill ~50%.
**Maps to:** AC-006, AC-007.

### TC-005: Next auto-plays the adjacent entry
**Precondition:** First of three videos active and playing.
**Steps:** Click next (or `Mod+Right`).
**Expected:** The second video becomes active, its `<video>` renders, and it is playing.
**Maps to:** AC-008.

### TC-006: Click a row to play it
**Precondition:** Playlist with several rows; row 3 not active.
**Steps:** Click row 3.
**Expected:** Row 3 becomes active and starts playing.
**Maps to:** AC-009.

### TC-007: Double-click toggles fullscreen
**Precondition:** A video is active; window is not fullscreen.
**Steps:** Double-click the viewport; then double-click again.
**Expected:** First double-click enters native fullscreen; second exits.
**Maps to:** AC-010.

### TC-008: Transport is a no-op with no active video
**Precondition:** Empty playlist, nothing active.
**Steps:** Click play/pause and next.
**Expected:** Nothing happens (no throw); readout stays `--:-- / --:--`; placeholder shown.
**Maps to:** AC-011.

## 4. UI States

| State   | Behavior                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------- |
| Loading | Source set but metadata not yet loaded: `<video>` mounted; readout total `--:--`/0 until metadata. |
| Empty   | Empty playlist / no active video: viewport placeholder ("No video selected"); readout `--:-- / --:--`. |
| Error   | File fails to load (bad/missing path): viewport keeps the `<video>`/placeholder; transport no-ops; no crash. |
| Success | Active file plays; readout + progress update live; controls drive the element.                    |

### Viewport - active (real video) (ASCII)

```
+--------------------------------------------------+
|                                                  |
|                                                  |
|                 [ <video> fills ]                |
|                                                  |
|                                                  |
|                      myclip.mp4                  |
+--------------------------------------------------+
   (double-click anywhere -> toggle fullscreen)
```

### Viewport - empty (ASCII)

```
+--------------------------------------------------+
|                                                  |
|                      (film)                      |
|                 No video selected                |
|                                                  |
+--------------------------------------------------+
```

### Transport bar - working (ASCII)

```
+==================================================+   <- progress fill (top border)
|              [<<]   [ || ]   [>>]      00:30/01:00 |
+--------------------------------------------------+
```

## 5. Data Model

The playlist node loses mock-only fields; it now carries the file path. Live playback figures
(current/duration) are **not** stored on the node - they live in playback state, sourced from
the element.

```ts
export type VideoFormat = "MP4" | "MKV" | "MOV" | "WEBM" | "AVI";

export type VideoNode = {
  id: string;        // = absolute path (unique per file)
  name: string;      // file basename
  format: VideoFormat;
  path: string;      // absolute filesystem path
};
```

Pure helper (unit-tested) maps picker paths to nodes:

```ts
// path -> VideoNode (basename for name, extension -> format)
function videosFromPaths(paths: readonly string[]): VideoNode[];
```

New `WorkspaceProvider` state + verbs (kept in context - "shared via context, no prop drilling"):

```ts
// playlist source becomes state (was a static prop; prop is now the INITIAL value, default [])
videos: VideoNode[];
loadVideos: (videos: VideoNode[]) => void;   // replace playlist, activate + play first

// live playback state, pushed up from the <video> element
playbackCurrentSec: number;   // live, 0 until first timeupdate
playbackDurationSec: number;  // live, 0 until loadedmetadata
reportProgress: (currentSec: number, durationSec: number) => void;
reportEnded: () => void;       // end -> isPlaying = false (no auto-advance)
```

Tauri surface (all in `src/lib/tauri.ts`, the single mockable IPC boundary):

```ts
openVideoFiles(): Promise<string[]>;          // dialog.open({ multiple, filters: [video exts] }); [] on cancel
toAssetUrl(path: string): string;             // convertFileSrc(path)
toggleFullscreen(): Promise<void>;            // getCurrentWindow(): setFullscreen(!isFullscreen())
```

Default binding added: `open-files` = `Mod+O`.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | Picker cancelled / returns `[]` | `loadVideos` not called; state unchanged (AC-003) |
| E-2 | Empty playlist when a transport command runs | Existing guards no-op; readout `--:-- / --:--` (AC-011) |
| E-3 | Duration unknown (metadata not loaded yet) | Total reads `--:--`/0; progress fill 0; `aria-valuemax` 0 (AC-006/AC-007) |
| E-4 | Single-file playlist + next/prev | Stays on the only file (existing wrap logic) |
| E-5 | File path with an unexpected/unknown extension | Picker filter restricts to known exts; helper still derives a `VideoFormat`, defaulting to `MP4` if unrecognised |
| E-6 | Video reaches natural end | `reportEnded` -> `isPlaying = false`; no auto-advance (out of scope) |
| E-7 | Re-selecting the already-active row | Stays active; play restarts/continues (auto-play sets `isPlaying = true`) |
| E-8 | Sort direction/key toggled while playing | Active video unchanged; prev/next follow the new order (existing behavior) |

## 7. Dependencies

New: `@tauri-apps/plugin-dialog@^2` (JS) + `tauri-plugin-dialog = "2"` (Rust crate, registered
in `lib.rs`). Reused: `@tauri-apps/api` (`core.convertFileSrc`, `window.getCurrentWindow`),
existing shortcut registry + hotkeys + command palette, shadcn/Tailwind tokens, `lucide-react`.

Capabilities (`src-tauri/capabilities/default.json`): add `dialog:default` (or
`dialog:allow-open`), `core:window:allow-set-fullscreen`, `core:window:allow-is-fullscreen`.
Config (`tauri.conf.json`): enable `app.security.assetProtocol` with a scope that allows the
user's files (broad local scope - see plan/ADR for the security note).

## 8. Out of Scope

- Seekable/scrubbable progress bar; volume, speed, mute, subtitles.
- Auto-advance on natural end; playlist persistence; recent files; drag-and-drop import.
- Fullscreen hotkey/palette command (double-click only).
- Live resolution badge in the sidebar; metadata sidecar storage.

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-20 | Initial draft - open files + real playback + working transport + native fullscreen |
