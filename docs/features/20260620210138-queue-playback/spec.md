# Spec: Queue playback behavior (auto-advance, shuffle, repeat)

**Version:** 0.1.0
**Created:** 2026-06-20
**Status:** Draft

## 1. Overview

Today the playlist has no notion of "what plays when the current video ends": `reportEnded`
(`src/components/workspace/workspace-context.tsx`) just pauses. This feature answers that
question with three composable controls:

- **Auto-advance** - when a video ends, play the next one (the base behavior).
- **Repeat** - a 3-state control: `off` | `all` | `one`. `off` stops at the end of the list;
  `all` loops the list; `one` replays the current video.
- **Shuffle** - an on/off toggle that makes "next" follow a stable shuffled order instead of the
  sorted playlist order. Affects both auto-advance AND the manual Next/Prev controls.

Repeat and shuffle are **orthogonal** (the universal media-player model: VLC/Spotify/YouTube) and
**compose** (e.g. shuffle + repeat-all loops a shuffled list forever).

The "what happens on ended" decision is a **pure function** (`decideOnEnded`), mirroring the
existing `plan_media` ADT precedent - no ifology in the verbs. Shuffle order is a pure
Fisher-Yates + reconcile pair, RNG-injected so it's deterministically testable.

What this delivers:
- `repeatMode` + `isShuffling` state in `WorkspaceProvider`; `cycleRepeat` + `toggleShuffle` verbs.
- `reportEnded` auto-advances / replays / stops per the pure `decideOnEnded`.
- Manual Next/Prev follow the shuffled order when shuffle is on.
- Transport-bar shuffle + repeat buttons, command-palette entries, and `S` / `R` hotkeys.

What this does NOT deliver (out of scope, YAGNI):
- Persisting the chosen mode across reloads (that's FR-7 settings).
- A visible "up next" queue list, drag-to-reorder, or removing items.
- Crossfade / gapless playback.

### User Story

As a user I want the player to keep playing when a clip ends - advancing to the next video,
looping the list, or repeating one - and to shuffle the order, so I can watch a folder of clips
hands-free instead of clicking Next after every file.

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | When a video ends with repeat=off, shuffle=off, and it is NOT last in the effective order, playback auto-advances to the next video and keeps playing. | Must |
| AC-002 | When the LAST video ends with repeat=off, playback stops (pauses); the active video is unchanged (no wrap). | Must |
| AC-003 | With repeat=all, ending any video advances to the next with wrap (last -> first) and keeps playing. | Must |
| AC-004 | With repeat=one, ending a video replays the SAME video from 0 and keeps playing; active is unchanged. | Must |
| AC-005 | With shuffle on, both auto-advance AND manual Next/Prev follow a stable shuffled order (a permutation of the playlist); Next then Prev returns to the same video. | Must |
| AC-006 | Toggling shuffle on/off does not interrupt the currently playing video (active + isPlaying unchanged); the active video keeps its place in the new order. | Must |
| AC-007 | repeat is a cycling control off -> all -> one -> off; shuffle is an independent boolean; the two compose (shuffle + repeat-all valid). Manual Next/Prev ignore repeatMode (always advance, with wrap). | Must |
| AC-008 | The transport bar shows a shuffle toggle and a repeat-cycle button, each reflecting current state (icon + accessible name); both are runnable from the command palette and via hotkeys (`S` shuffle, `R` repeat). | Must |
| AC-009 | The ended decision is a PURE function `decideOnEnded(order, activeId, mode)` returning an ADT (`advance`/`replay`/`stop`), unit-tested across modes and positions; shuffle is a pure `shuffleIds(ids, rng)` + `reconcileOrder(order, ids)` pair, unit-tested; the verbs carry no codec/queue ifology. | Must |
| AC-010 | `npm run lint`, `npm run typecheck`, `npm test` all exit 0. | Must |

## 3. User Test Cases

### TC-001: Auto-advance mid-list (AC-001)
Playlist [a,b,c], active=a, repeat=off, shuffle=off. `reportEnded` -> active=b, isPlaying=true. Maps to: AC-001.

### TC-002: Stop at end (AC-002)
Active=c (last), repeat=off. `reportEnded` -> active=c (unchanged), isPlaying=false. Maps to: AC-002.

### TC-003: Repeat-all wraps (AC-003)
Active=c (last), repeat=all. `reportEnded` -> active=a, isPlaying=true. Maps to: AC-003.

### TC-004: Repeat-one replays (AC-004)
Active=b, repeat=one. `reportEnded` -> active=b, current resets to 0, isPlaying=true. Maps to: AC-004.

### TC-005: Shuffle order is stable, Next/Prev round-trips (AC-005)
shuffle on with injected RNG producing order [b,a,c]. From a, Next -> c, Prev -> a. Maps to: AC-005.

### TC-006: Shuffle drives auto-advance (AC-005)
shuffle on, order [b,a,c], active=a. `reportEnded` -> active=c (the element after a in shuffled order). Maps to: AC-005.

### TC-007: Toggling shuffle keeps the active video playing (AC-006)
active=b, isPlaying=true. `toggleShuffle` -> active=b, isPlaying=true (uninterrupted). Maps to: AC-006.

### TC-008: Repeat cycles off->all->one->off (AC-007)
`cycleRepeat` x3 from off returns to off, visiting all then one. Maps to: AC-007.

### TC-009: Manual Next ignores repeat-one (AC-007)
repeat=one, active=a. `nextVideo` -> active=b (advances, does NOT replay a). Maps to: AC-007.

### TC-010 (pure): decideOnEnded matrix (AC-009)
`decideOnEnded(["a","b","c"], "a", "off")` -> `{kind:"advance", id:"b"}`; `(..., "c", "off")` -> `{kind:"stop"}`; `(..., "c", "all")` -> `{kind:"advance", id:"a"}`; `(..., "b", "one")` -> `{kind:"replay"}`; single `(["a"], "a", "all")` -> `{kind:"replay"}`. Maps to: AC-009.

### TC-011 (pure): shuffleIds is a permutation (AC-009)
`shuffleIds(["a","b","c","d"], rng)` returns the same multiset (a permutation), deterministic for a fixed RNG. Maps to: AC-009.

### TC-012 (pure): reconcileOrder self-heals (AC-009)
`reconcileOrder(["b","a","c"], ["a","b","c","d"])` -> `["b","a","c","d"]` (drops missing, appends new at end, preserves existing order). Maps to: AC-009.

### TC-013: Transport renders shuffle + repeat controls reflecting state (AC-008)
With shuffle on + repeat=one, the bar shows a pressed shuffle control and a repeat control whose accessible name says "one". Maps to: AC-008.

### TC-014: Empty playlist is a no-op (edge)
No active video: `reportEnded`, `toggleShuffle`, `cycleRepeat` do not throw and change nothing observable. Maps to: AC-001 (guard).

## 4. UI States

| State | Behavior |
| ----- | -------- |
| Repeat off | Repeat icon dim (`text-muted-foreground`); accessible name "Repeat: off". On end of last video, playback stops. |
| Repeat all | Repeat icon bright (`text-foreground`); name "Repeat: all". Loops the list. |
| Repeat one | Repeat-1 icon bright; name "Repeat: one". Replays the current video. |
| Shuffle off | Shuffle icon dim; `aria-pressed=false`; name "Shuffle". Order = sorted playlist. |
| Shuffle on | Shuffle icon bright; `aria-pressed=true`; name "Shuffle". Order = stable permutation. |

### Transport bar wireframe (full width, h-12, 1px-divided cells)

```
+-------------------------------------------------------------------------------+
|=========================== seek progress (1px, top edge) =====================|
+------+------------+------+------+------+------+------+----------+--------------+
| Mute | volume === |  <<  |  >|| |  >>  |  Sh  |  Rp  |          |  0:42 / 3:15 |
+------+------------+------+------+------+------+------+----------+--------------+
  mute    volume      prev  play   next  shuffle repeat              time
```

- `Sh` = shuffle toggle, `Rp` = repeat cycle. Both share `BAR_BUTTON` (`h-full w-12 rounded-none`,
  `border-l border-border`), appended to the center transport cluster after Next.
- Dim icon = inactive (off), bright icon = active; repeat swaps `Repeat` <-> `Repeat1` glyph for all/one.
- No new height, no rounding, no floating chips (docs/design.md Layout + Corners rules).

## 5. Data Model

```ts
type RepeatMode = "off" | "all" | "one";

type EndedDecision =
  | { kind: "advance"; id: string }
  | { kind: "replay" }
  | { kind: "stop" };

// pure (src/components/workspace/queue.ts)
function nextRepeatMode(mode: RepeatMode): RepeatMode;       // off -> all -> one -> off
function shuffleIds(ids: string[], rng: () => number): string[];   // Fisher-Yates
function reconcileOrder(order: string[], ids: string[]): string[]; // drop missing, append new
function decideOnEnded(order: string[], activeId: string, mode: RepeatMode): EndedDecision;
```

Context additions (`WorkspaceProvider`):
- State: `repeatMode: RepeatMode` (default `"off"`), `isShuffling: boolean` (default `false`),
  `shuffleOrder: string[]` (set on toggle-on).
- Verbs: `cycleRepeat()`, `toggleShuffle()`.
- Exposed: `repeatMode`, `isShuffling`.
- Test seam: optional `rng?: () => number` prop (default `Math.random`), mirroring the existing
  `videos?` / `initial*` seam props.

**Effective order** (what Next/Prev/auto-advance walk):
`isShuffling ? reconcileOrder(shuffleOrder, playlistIds) : playlistIds`, where `playlistIds` is the
sorted `playlist` mapped to ids. `stepVideo` and `reportEnded` both use this order.

`decideOnEnded` rules: `one` -> replay; else if the computed next id equals the active id ->
replay (single-video repeat-all); else `off` + last -> stop; otherwise advance to next (wrap).

`reportEnded` maps the ADT: `advance` -> activate(id); `replay` -> seek to 0 + keep playing;
`stop` -> pause.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | Empty playlist / no active video | `reportEnded` / `cycleRepeat` / `toggleShuffle` are no-ops (existing length/active guards). |
| E-2 | Single video, repeat=all | `decideOnEnded` next id == active -> `replay` (re-plays itself), not a dead `advance`. |
| E-3 | Single video, repeat=off | last -> `stop`. |
| E-4 | repeat=one + manual Next | Next advances (ignores repeatMode); only `ended` honors repeat-one. |
| E-5 | Append videos (drop/open) while shuffling | `reconcileOrder` appends new ids at the end of the shuffle order; no reshuffle, no lost cursor. |
| E-6 | Sort keys/direction change while shuffling | Shuffle order is frozen at toggle-on; sort changes don't reshuffle. Off -> stepping follows the live sorted order again. |
| E-7 | Replay (repeat-one) must actually resume | `reportEnded` sets `seekToSec=0` + `isPlaying`; the viewport seek effect resumes `play()` when `isPlaying`. `reportProgress` nulls `seekToSec` between plays so re-setting 0 is always a state change. |

## 7. Dependencies

Frontend only. New lucide icons (`Shuffle`, `Repeat`, `Repeat1`) - already in the installed
`lucide-react`. No new packages, no Rust change.

## 8. Out of Scope

Mode persistence (FR-7), visible up-next queue, reorder/remove, gapless/crossfade.

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-20 | Initial - auto-advance + repeat (off/all/one) + shuffle; pure `decideOnEnded` ADT and `shuffleIds`/`reconcileOrder`; transport buttons + `S`/`R` hotkeys + palette. |
