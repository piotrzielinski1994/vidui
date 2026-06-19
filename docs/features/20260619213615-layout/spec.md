# Spec: Layout - MVP Player Shell

**Version:** 0.2.0
**Created:** 2026-06-19
**Status:** Draft

## 1. Overview

Deliver the MVP visual shell of the video player: a resizable workspace with a flat
playlist sidebar, a video viewport, and a transport bar - driven by mock data with **no
real behavior** (no real playback, no file IO, no persistence). The goal is to validate
the layout and the component/state architecture before any media features land.

What this feature delivers:
- A full-window workspace layout that replaces the bootstrap demo home route.
- A flat playlist sidebar: the videos currently "open" in the app, one row each (no
  folders, no nesting).
- A sidebar header with a sort control (ASC/DESC toggle, natural/numeric-aware ordering).
- A video viewport: a mock frame that fills the whole content area, letterboxed (black
  bars) when the aspect ratio does not match.
- A transport bar (prev / play-pause / next + time readout) whose progress indicator is
  rendered as the bar's top border (a full-width line).
- A resizable split between sidebar and content.
- UI-local interactivity only: selection, play/pause toggle, prev/next, sort toggle.

What this feature does **not** deliver:
- No real video playback. The viewport is a mock frame; the progress line is inert.
- No persistence (no file storage, no Tauri IPC for the library).
- No real "open file" flow (the open playlist is seeded from mock data).
- No command palette / top nav (both removed - they were bootstrap scaffold).

### User Story

As a developer building this video player, I want the full player layout standing with
mock data and local UI state, so that the structure and component architecture are
validated and future features (real playback, open-file, persistence) have a shell to
plug into.

### Approved layout (ASCII)

Overall - sidebar spans full height on the left; the right side stacks the viewport over
the transport bar. The viewport fills all remaining space; the transport bar's top edge
is the progress line:

```
+----------------+--------------------------------------------+
| Playlist [A^]  |##################  progress (top border) ##|
|                |                                            |
| [MP4] 1 Open   |          +----------------------+          |
| [MOV] 3 Intro  |          |                      |  <- mock |
| [WEBM] 9 Inter |          |   letterboxed frame  |  frame   |
| [MKV] 12 Bridge|          |   (black bars top/bot|  fills   |
| [AVI] 21 Final |          +----------------------+  area    |
|                |                                            |
|                +========= progress top border =============+
|                | [|<]   [ || ]   [|>]            01:23/09:56|
+----------------+--------------------------------------------+
```

Sidebar - a flat list of the open videos, each row a format badge + name. The header
carries the title and a sort toggle (`A^` ascending / `A v` descending):

```
Playlist                 [ Name A^ ]   <- header + sort toggle
[MP4]   1 - Opening
[MOV]   3 - Intro
[WEBM]  9 - Interlude
[MKV]   12 - Bridge
[AVI]   21 - Finale
```

Natural ordering rule - when names carry a numeric prefix, sort by the numeric VALUE,
not lexically. ASC: `1, 3, 9, 12, 21` (NOT the lexical `1, 12, 21, 3, 9`). DESC reverses.

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | The workspace layout renders at the home route (`/`), replacing the bootstrap demo page | Must |
| AC-002 | The layout fills the full window: sidebar (full height) on the left, viewport over transport bar on the right | Must |
| AC-003 | The sidebar renders a FLAT list of the open videos (no folders, no nesting); each row shows a format badge + name | Must |
| AC-004 | Clicking a list item selects it (highlight) and loads it as the active video; the viewport + transport reflect it | Must |
| AC-005 | The viewport renders the active video's mock frame filling the content area, letterboxed (black bars) on aspect mismatch, with the name + resolution shown; a neutral empty state when none is active | Must |
| AC-006 | The transport bar renders prev / play-pause / next buttons and a time readout (`mm:ss / mm:ss`); the progress indicator is rendered as the bar's top border (a full-width line, `role="progressbar"`) | Must |
| AC-007 | The play-pause button toggles between play and pause affordances (UI-local `isPlaying`) | Must |
| AC-008 | Prev/next step the active video through the current (sorted) list order, wrapping at the ends | Must |
| AC-009 | Video rows show a format badge (MP4/MKV/MOV/WEBM/AVI) colored per format | Must |
| AC-010 | The sidebar header has a sort field selector (a rectangular multi-select combobox, styled like requi's env selector, right-aligned in the header) listing fields Title / Type, plus an ascending <-> descending toggle. Selecting both composes a tie-break chain in selection order (first = primary). Title is natural/numeric-aware (a numeric prefix sorts by value, so `3` precedes `21`). The resulting order drives both the list AND prev/next | Must |
| AC-011 | The sidebar\|content split is resizable via a drag handle | Must |
| AC-012 | All UI state (selection, active video, isPlaying, sort direction) is shared across panels without prop drilling | Must |
| AC-013 | The bootstrap demo (greeting + Button home page, top nav, command palette) is removed | Must |
| AC-014 | `npm run lint`, `npm run typecheck`, and `npm test` exit 0 | Must |

## 3. User Test Cases

### TC-001: Workspace renders on launch

**Precondition:** App built, home route loaded.
**Steps:** Launch the app; observe the window.
**Expected Result:** Sidebar (left, full height) with a flat playlist; viewport top-right; transport bar bottom-right. No bootstrap demo content, no top nav.
**Maps to:** workspace render test. AC-001, AC-002, AC-013.

### TC-002: Select a video

**Steps:** Click a row in the playlist.
**Expected Result:** The row is highlighted (selected) and it becomes the active video; the viewport shows its name + resolution.
**Maps to:** video-list selection + viewport tests. AC-003, AC-004, AC-005.

### TC-003: Toggle play/pause

**Steps:** With a video active, click the play button, then again.
**Expected Result:** The button flips to a pause affordance, then back to play.
**Maps to:** transport play-pause test. AC-007.

### TC-004: Step to the next video

**Steps:** With the first video active, click the next (`>|`) button.
**Expected Result:** The active video advances to the next in list order; from the last, next wraps to the first.
**Maps to:** transport prev/next test. AC-008.

### TC-005: Sort the playlist

**Steps:** With an unsorted (open-order) playlist whose names have numeric prefixes (e.g. `1, 21, 3`), click the sort control.
**Expected Result:** Ascending natural order (`1, 3, 21`), NOT lexical (`1, 21, 3`). Clicking again flips to descending. The active video is preserved; prev/next now follow the new order.
**Maps to:** sort-control + natural-sort tests. AC-010.

### TC-006: Resize the split

**Steps:** Drag the handle between sidebar and content.
**Expected Result:** The sidebar width changes; content reflows.
**Maps to:** manual / smoke (resizable behavior owned by the shadcn primitive). AC-011.

## 4. Data Model

Mock data lives in one module (`mock-data.ts`). The playlist is a flat list of videos -
no folder/tree union.

```ts
type VideoFormat = "MP4" | "MKV" | "MOV" | "WEBM" | "AVI";

type VideoNode = {
  id: string;
  name: string;            // may carry a numeric prefix, e.g. "21 - Finale"
  format: VideoFormat;
  resolution: string;      // e.g. "1080p"
  durationSec: number;     // total length, for the time readout
};

const mockVideos: VideoNode[];   // a handful of open files, names numeric-prefixed
```

Natural/composite sort (`sort-natural.ts`): `sortVideos(videos, keys, direction)` where
`keys: SortField[]` (`"title" | "type" | "duration" | "resolution"`) is the ordered
tie-break chain (first = primary). Per key: `title` compares names natural/numeric-aware
(integer prefix by value, else locale-aware), `type` compares the format string,
`duration` compares `durationSec`, `resolution` compares the resolution string. Equal on
one key falls through to the next; `direction` (`"asc"`/`"desc"`) reverses the whole
chain. Empty `keys` = open order (no sort). The `SortField` type + all four comparators
exist, but the UI surfaces only Title and Type for now (Duration/Resolution kept in the
sort engine for later, not exposed in the selector).

### UI state (behavior, not shape)

The workspace tracks, as local UI state: which video is selected (highlighted), which
video is active, whether playback is (mock) playing, and the sort direction. The exact
state container and setter API are an implementation concern (see plan.md).

Behavior decisions that constrain that state:
- **Selection and active video coincide** (selecting a row both highlights and activates).
- **The playlist order** = the open-order list, optionally re-ordered by the sort control.
  Prev/next operate on this current order, wrapping at the ends.
- **Sort direction** defaults to unset (open order) in the provider; the control toggles
  ascending <-> descending. The home route seeds it to ascending so launch shows a
  naturally-sorted list (`1, 3, 9, 12, 21`), not raw open order.
- **Initial state** is seeded from mock data: first video active, ascending sort at the home route.
- **isPlaying** is purely visual for MVP (no real playback); defaults to paused.

## 5. UI Behavior

- **Styling:** native shadcn/ui (New York, neutral base) + Tailwind v4 theme tokens. Light/dark aware.
- **Inert affordances:** the progress line and viewport frame are read-only renders. They have no behavior beyond presence.
- **Viewport fill:** the mock frame fills the content area; on aspect mismatch it is letterboxed (black bars), never stretched.
- **Empty state:** when no video is active, the viewport renders a neutral "No video selected" placeholder and the transport time reads `--:-- / --:--`.
- **Format badge:** videos show a small format badge (MP4/MKV/...) pinned to the right
  edge of each row; the name sits at the left.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | No active video | Viewport + transport show empty state (`--:-- / --:--`); prev/next/play are inert no-ops |
| E-2 | Re-selecting the already-active video | No change (stays active + selected) |
| E-3 | Next from the last video / prev from the first | Wraps (last -> first, first -> last) in the current sort order |
| E-4 | Single video in playlist | Prev/next keep the same video active (wrap to self) |
| E-5 | Name with no numeric prefix | Sorts locale-aware by name; mixes with numeric-prefixed names without throwing |
| E-6 | Sort toggled while a video is active | Active video preserved; only list/prev-next order changes |

## 7. Dependencies

New dependency: `react-resizable-panels` (via the shadcn `resizable` component). shadcn/ui
components used: `resizable`, `scroll-area`, `badge`, `button`. `lucide-react` (already
present) supplies the transport + sort icons. The video list is a custom flat component
(no shadcn primitive).

Removed: the bootstrap demo home page (greeting query + Button), the top nav in
`__root.tsx`, and the command palette (`command-palette.tsx`). The `greet` Tauri command
and its wrapper stay (proof-of-IPC, reused later). The `/settings` route is kept but loses
its nav link.

## 8. Out of Scope

- Real video playback / decoding / file IO; a real open-file dialog.
- Persistence (file storage, Tauri IPC, saving state/order).
- Editing the playlist (drag-to-reorder, add/remove, rename).
- Search/filter; sort fields other than name (e.g. duration).
- Keyboard shortcuts for transport/list.
- Volume / fullscreen / playback-rate controls.

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-19 | Initial draft - video-mapped from requi's layout feature |
| 0.2.0 | 2026-06-19 | Reworked from user feedback: flat playlist (no folders), sort control (natural ASC/DESC), viewport fills+letterbox, progress as transport top-border |
