# Spec: Drag & drop import (append)

**Version:** 0.1.0
**Created:** 2026-06-20
**Status:** Draft

## 1. Overview

Let the user drop video files - and folders of videos - from Finder/Explorer onto the app
window. Dropped videos are **appended** to the current playlist (the first import primitive that
does not replace). Folders are recursed and their video files added; non-video files are ignored.
A full-window overlay shows while a drag hovers, so the window reads as a drop target.

This introduces the shared append primitive `addVideos` that future import paths (folder picker,
etc.) can reuse. Today only `loadVideos` (replace) exists.

What this delivers:
- A Rust command `expand_dropped_paths(paths) -> paths` that walks each dropped path (recursing
  directories), keeps only video-extension files, dedupes, and sorts. Pure helpers
  `has_video_extension` + `collect_video_paths` are unit-tested without a Tauri host.
- `@/lib/tauri` additions: `expandDroppedPaths(paths)` (invoke wrapper) and `watchFileDrop(handler)`
  - subscribes to the webview drag-drop event and emits a flat `FileDropEvent`.
- `addVideos(next)` on `WorkspaceProvider`: append + dedupe by id; activate the first newly-added
  video only when nothing was active (empty-playlist parity with Open Files).
- `Workspace` wiring: subscribe on mount; an `isDragging` flag drives a `DropOverlay`; on drop,
  expand -> map to `VideoNode[]` -> `addVideos`.

What this does **not** deliver (out of scope):
- Any append-vs-replace mode toggle, command-palette entry, or hotkey (explicitly cut by the user).
- Changing the Open Files picker - it still **replaces** the playlist.
- Drag-to-reorder within the playlist, drag-out, or OS-level "open with".
- Persisting the playlist across reloads (FR-5).

### User Story

As a user I want to drag video files or a folder of videos from my file manager onto the VidUI
window and have them added to whatever I'm already playing, so I can build up a playlist without
opening the picker or losing my current queue.

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Dropping one or more video files onto the window appends them to the playlist (does not replace); each becomes a row. | Must |
| AC-002 | Dropping a folder recurses it (any depth) and appends every video file found; non-video files are ignored. | Must |
| AC-003 | Only files whose extension is in the video set (`mp4`/`mkv`/`mov`/`webm`/`avi`, case-insensitive) are imported; everything else is dropped silently. | Must |
| AC-004 | Dropping onto an EMPTY playlist appends, then activates + plays the first imported video (parity with Open Files). | Must |
| AC-005 | Dropping while a video is already active leaves the active video and its playback state untouched; new videos are appended after the existing ones. | Must |
| AC-006 | Paths already in the playlist are not duplicated; duplicates within a single drop are also collapsed (dedupe by path/id). | Must |
| AC-007 | While files are dragged over the window a full-window overlay ("Drop to add") is shown; it clears on drop and on drag-leave/cancel. | Must |
| AC-008 | A drop yielding zero video files (only unsupported files, or an empty folder) leaves the playlist unchanged and clears the overlay (safe no-op). | Must |
| AC-009 | `npm run lint`, `npm run typecheck`, `npm test`, `cargo test`, `cargo build` all exit 0. | Must |

## 3. User Test Cases

### TC-001: Drop files onto empty playlist
**Precondition:** Empty playlist, nothing active.
**Steps:** Drop `[/v/a.mp4, /v/b.mkv]` (expand returns them as-is).
**Expected:** 2 rows; `a.mp4` is active and playing (pause button shown).
**Maps to:** AC-001, AC-004.

### TC-002: Append to a playing playlist
**Precondition:** Playlist `[x.mp4]`, `x.mp4` active and playing.
**Steps:** Drop `[/v/y.mp4]`.
**Expected:** Rows become `[x.mp4, y.mp4]`; `x.mp4` still active and still playing.
**Maps to:** AC-005, AC-001.

### TC-003: Folder recursion (Rust)
**Precondition:** Temp dir `root/` with `clip.mp4`, `nested/deep.mkv`, `notes.txt`.
**Steps:** `collect_video_paths([root])`.
**Expected:** `[root/clip.mp4, root/nested/deep.mkv]` (sorted), `notes.txt` excluded.
**Maps to:** AC-002, AC-003.

### TC-004: Unsupported-only drop
**Precondition:** Playlist `[a.mp4]`.
**Steps:** Drop expands to `[]` (e.g. `doc.pdf`, `song.mp3` filtered out).
**Expected:** Playlist still `[a.mp4]`; overlay cleared; no throw.
**Maps to:** AC-003, AC-008.

### TC-005: Dedupe against existing + within drop
**Precondition:** Playlist `[a.mp4]`.
**Steps:** Drop `[/v/a.mp4, /v/b.mp4]`.
**Expected:** Rows `[a.mp4, b.mp4]` - `a.mp4` not doubled.
**Maps to:** AC-006.

### TC-006: Overlay lifecycle
**Precondition:** Workspace open.
**Steps:** Fire drag-enter, then drag-leave; separately fire drag-enter then drop.
**Expected:** Overlay visible after enter; hidden after leave; hidden after drop.
**Maps to:** AC-007.

### TC-007: Zero-result drop is a no-op
**Precondition:** Playlist `[a.mp4]`, active+playing.
**Steps:** Drop expands to `[]`.
**Expected:** No active change, still playing, rows unchanged, overlay cleared.
**Maps to:** AC-008.

### TC-008: Extension helper (Rust)
**Precondition:** n/a.
**Steps:** `has_video_extension` on `clip.mp4`, `CLIP.MKV`, `a.MOV`, `notes.txt`, `song.mp3`, `noext`.
**Expected:** true, true, true, false, false, false.
**Maps to:** AC-003.

## 4. UI States

| State           | Behavior                                                                     |
| --------------- | ---------------------------------------------------------------------------- |
| Idle            | No overlay; window normal.                                                   |
| Dragging-over   | Full-window dim overlay, centered "Drop to add" message; pointer-events pass. |
| Drop (videos)   | Overlay clears; videos appended; first activates only if playlist was empty.  |
| Drop (no video) | Overlay clears; nothing changes.                                             |
| Leave / cancel  | Overlay clears; nothing changes.                                             |

### Drop overlay (ASCII)

```
+================================================================+
|                                                                |
|                                                                |
|                   +----------------------+                     |
|                   |                      |                     |
|                   |      Drop to add     |                     |
|                   |                      |                     |
|                   +----------------------+                     |
|                                                                |
|                                                                |
+================================================================+
```

(Overlay spans the whole window above the workspace; dim backdrop, centered card with the
message. No rounded corners - per design.md. Shown only while a drag is over the window.)

## 5. Data Model

New `WorkspaceProvider` verb (context-owned, no prop drilling):

```ts
// append imported videos; dedupe by id (= path); activate the first NEW one
// only when nothing is active yet (empty-playlist parity with loadVideos).
addVideos: (videos: VideoNode[]) => void;
```

`VideoNode`, `videosFromPaths`, and `loadVideos` are unchanged and reused.

New `@/lib/tauri` surface:

```ts
// Rust: walk dropped paths, recurse dirs, keep video exts, dedupe, sort.
export function expandDroppedPaths(paths: string[]): Promise<string[]>;

export type FileDropEvent =
  | { type: "enter"; paths: string[] }
  | { type: "leave" }
  | { type: "drop"; paths: string[] };

// Subscribe to the webview drag-drop event; no-op (returns NO_UNLISTEN) outside a Tauri host.
export function watchFileDrop(
  handler: (event: FileDropEvent) => void,
): Promise<() => void>;
```

New Rust command (`src-tauri/src/import.rs`):

```rust
#[tauri::command]
pub fn expand_dropped_paths(paths: Vec<String>) -> Vec<String>;

// pure, unit-tested:
fn has_video_extension(name: &str) -> bool;
fn collect_video_paths(roots: &[String]) -> Vec<String>; // recurse + filter + dedupe + sort
```

`VIDEO_EXTENSIONS` (`mp4`, `mkv`, `mov`, `webm`, `avi`) is mirrored from the existing JS list in
`tauri.ts` / `videos-from-paths.ts`. No new packages; std `fs` walk on the Rust side.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | Drop only unsupported files | filtered out -> empty result -> playlist unchanged, overlay cleared (AC-008) |
| E-2 | Drop an empty folder / folder with no videos | recursion yields nothing -> no-op (AC-008) |
| E-3 | Path already in playlist | `addVideos` dedupes by id; existing rows win, order preserved (AC-006) |
| E-4 | Duplicate paths within one drop | `collect_video_paths` dedupes; `addVideos` dedupes again defensively |
| E-5 | Drop onto empty vs non-empty playlist | empty -> activate+play first new; non-empty -> append only, active untouched (AC-004/AC-005) |
| E-6 | Drag-leave without dropping | overlay clears; no import (AC-007) |
| E-7 | Mixed files + folders in one drop | each root expanded independently, results concatenated then deduped/sorted |
| E-8 | Unreadable dir / permission error during walk | walk skips the unreadable entry (best-effort `read_dir`), does not fail the whole drop |
| E-9 | Not running in a Tauri host (browser dev / jsdom) | `watchFileDrop` try/catch -> NO_UNLISTEN; no crash |
| E-10 | Symlink loop in a dropped folder | walk does not follow symlinked dirs (only `is_dir` on real entries; no cycle) |

## 7. Dependencies

Reused only: `@tauri-apps/api/webview` (`getCurrentWebview().onDragDropEvent`), the existing
`invoke` wrapper pattern in `tauri.ts`, `videosFromPaths`, the `WorkspaceProvider` context,
Tailwind tokens. Rust uses std `fs` only. No new npm or cargo packages. Native drag-drop is
enabled by default in Tauri (`dragDropEnabled`); no config change.

## 8. Out of Scope

- Append/replace toggle, palette command, hotkey; changing Open Files; drag-reorder; persistence (FR-5).

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-20 | Initial draft - drop files/folders -> append; folder recurse + ext filter in Rust; full-window overlay; append-only (toggle cut). |
