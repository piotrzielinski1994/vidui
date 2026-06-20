# Plan: Drag & drop import (append)

Implements [spec.md](spec.md). TDD red-green-refactor. Branch: `20260620183707-drag-drop-import`.

## Approach

Three layers, smallest pieces first:

1. **Rust (`src-tauri/src/import.rs`)** - new module owning the filesystem walk. A `#[tauri::command]`
   `expand_dropped_paths(paths: Vec<String>) -> Vec<String>` delegates to a pure
   `collect_video_paths(&[String])` (recurse dirs via std `fs::read_dir`, keep files whose name
   passes `has_video_extension`, dedupe via a set, sort). `has_video_extension` + `collect_video_paths`
   are unit-tested with a real temp dir - no Tauri host needed. Registered in `lib.rs`'s
   `invoke_handler`. Walk is best-effort: an unreadable dir is skipped, never fatal; symlinked dirs
   are not followed (only descend real `is_dir` entries) so no cycles.

2. **`@/lib/tauri`** - `expandDroppedPaths(paths)` is the usual `invoke<string[]>("expand_dropped_paths", { paths })`
   wrapper. `watchFileDrop(handler)` subscribes to `getCurrentWebview().onDragDropEvent` and maps
   the Tauri `DragDropEvent` (`enter`/`over`/`drop`/`leave`) to our flatter `FileDropEvent`
   (`enter`/`leave`/`drop`, ignoring `over`), guarded by try/catch -> `NO_UNLISTEN` outside a host
   (same pattern as `watchFullscreen`).

3. **Context + Workspace** - `addVideos(next)` appends to `sourceVideos`, deduping by `id`
   (existing rows win), and activates the first newly-added video only when `activeVideoId === null`.
   `Workspace` subscribes via `watchFileDrop` in an effect, holds `isDragging` local state, and on a
   `drop` event runs `expandDroppedPaths(paths)` -> `videosFromPaths` -> `addVideos`. A `DropOverlay`
   renders over the layout when `isDragging`.

### Why Rust does the walk

Filesystem recursion + extension filtering is backend work (mirrors `media.rs`). The webview hands
JS a mixed list of file AND folder paths; expanding folders in JS would need a second IPC round-trip
per dir anyway. One command in, flat video-path list out.

### Activation parity

`loadVideos` activates `next[0]`. `addVideos` must only auto-activate when nothing plays yet, and
must activate the first *appended* node (not the first row after sort), so a drop onto an empty
list behaves like Open Files while a drop onto a playing list never hijacks playback.

## Files

### Create
- `src-tauri/src/import.rs` - `expand_dropped_paths` command + `has_video_extension` +
  `collect_video_paths` + `#[cfg(test)] mod tests`.
- `src/components/workspace/drop-overlay.tsx` - full-window overlay ("Drop to add"), no rounded
  corners, dim backdrop, centered card.
- `src/components/workspace/__tests__/workspace-drop.test.tsx` - FE behavior (mock `@/lib/tauri`,
  capture the `watchFileDrop` handler, fire enter/leave/drop, assert playlist + overlay + activation).
- `src/lib/__tests__/file-drop.test.ts` (only if a pure helper emerges; otherwise FE behavior covers it).

### Modify
- `src-tauri/src/lib.rs` - `mod import;` + `import::expand_dropped_paths` in `generate_handler!`.
- `src/lib/tauri.ts` - `expandDroppedPaths`, `FileDropEvent`, `watchFileDrop`.
- `src/components/workspace/workspace-context.tsx` - add `addVideos` to the value + type.
- `src/components/workspace/workspace.tsx` - subscribe to `watchFileDrop`, `isDragging` state,
  drop handler, render `DropOverlay`.
- `README.md` - workspace prose: drop files/folders -> append (mention folder recurse + filter).
- `docs/learnings.md` - any non-obvious gotcha found while wiring the webview drag-drop event in tests.
- `.pzielinski/FR-3.md` - AC traceability + completion at the end.

## Tests (TDD)

Rust (`cargo test` in `src-tauri`) - owns the walk:
- `has_video_extension`: mp4/MKV/.MOV -> true; txt/mp3/noext -> false. (AC-003, TC-008)
- `collect_video_paths` on a temp tree: recurses, keeps videos, drops `notes.txt`, sorted. (AC-002/003, TC-003)
- `collect_video_paths` dedupes a path passed twice. (AC-006, E-4)
- `collect_video_paths` on an empty/no-video dir -> `[]`. (AC-008, E-2)

Frontend (`npm test`, Vitest) - behavior via the mocked `@/lib/tauri` seam:
- empty playlist + drop -> rows appear, first active + playing. (AC-001/004, TC-001)
- playing playlist + drop -> appended, active unchanged, still playing. (AC-005, TC-002)
- drop with `expandDroppedPaths` returning a dup of an existing path -> not doubled. (AC-006, TC-005)
- drop expanding to `[]` -> playlist + active untouched, overlay cleared. (AC-008, TC-004/007)
- drag-enter shows overlay; drag-leave hides it; drop hides it. (AC-007, TC-006)
- `addVideos` unit (context) tests can also assert append/dedupe/activation directly.

Real native drag-drop is **not** unit-testable (needs a Tauri host + OS drag) -> `cargo build`
(wiring compiles) + user `npm start` verification (AC-009 partial; runtime drop manual).

## Acceptance verification

| AC | Verified by |
|----|-------------|
| AC-001 | FE drop test (rows appended) |
| AC-002 | Rust `collect_video_paths` recursion test + user `npm start` (real folder) |
| AC-003 | Rust `has_video_extension` + `collect_video_paths` filter tests |
| AC-004 | FE empty-playlist drop test (first active + playing) |
| AC-005 | FE playing-playlist drop test (active untouched) |
| AC-006 | Rust dedupe test + FE dedupe-against-existing test |
| AC-007 | FE overlay enter/leave/drop test |
| AC-008 | FE zero-result test + Rust empty-dir test |
| AC-009 | `npm run lint` + `npm run typecheck` + `npm test` + `cargo test` + `cargo build` |

## Risks

- Native drag-drop unverifiable in sandbox: mitigate via the mocked-seam FE tests + `cargo build` + user `npm start`.
- Event-listen permission: `core:default` should cover `listen`; if `cargo build`/runtime complains, add `core:event:default` to `capabilities/default.json`.
- Large folder walk blocks: acceptable for a desktop player; sync std walk, no symlink-follow (no cycle).

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-20 | Append-only; no replace toggle / palette / hotkey. | User scoped FR-3 to "drop -> add". YAGNI on the toggle. Open Files still replaces. |
| 2026-06-20 | Folder recursion + ext filter in Rust (`expand_dropped_paths`). | FS walk is backend work (mirrors media.rs); avoids per-dir IPC round-trips from JS. |
| 2026-06-20 | `isDragging` overlay state local to `Workspace`, not context. | Ephemeral drag UI; context holds durable playlist/playback state only. |
| 2026-06-20 | `addVideos` auto-activates only when nothing is active. | Drop onto empty list mirrors Open Files; drop while playing must not hijack the active video. |
| 2026-06-20 | `addVideos`/`activateVideo` built with `useCallback([])` reading live state via refs. | Consumed in the `Workspace` drop-effect dep array; an unstable identity re-subscribed `watchFileDrop` on every state change, and the stale cleanup nulled the captured handler -> dropped events hit nobody. Mirrors the existing `setFullscreen` stability pattern. |

## Verification (final)

All gates green: `npm run lint` (0 err, 2 pre-existing warns), `npm run typecheck`, `npm test`
(210), `cargo test` (22), `cargo build`, `cargo clippy` (0). Fresh-context verifier: PASS on all
9 ACs, no weak/over-mocked tests, edge cases (zero-result, dedupe, empty-vs-non-empty activation,
overlay clear, no-host safety, symlink-loop, unreadable-dir) sound. AC-005 precondition confirmed
genuine (test starts playback before the drop). No doc drift.

Status: code complete + machine-verified. Native runtime drop (AC-001/002/007 end-to-end) needs
a user on-device `npm start` - real Finder/Explorer drag-drop is not sandbox-provable.
