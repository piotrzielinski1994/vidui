# Plan: Queue playback behavior

Implements [spec.md](spec.md). TDD red-green-refactor. Branch: `20260620210138-queue-playback`.

## Approach

Frontend only. The whole decision is concentrated in one new pure module + a thin mapping in the
context verbs - no ifology in the verbs (mirrors the `plan_media` ADT precedent).

1. **Pure queue module** `src/components/workspace/queue.ts`:
   - `type RepeatMode = "off" | "all" | "one"`.
   - `type EndedDecision = {kind:"advance", id} | {kind:"replay"} | {kind:"stop"}`.
   - `nextRepeatMode(mode)` - off -> all -> one -> off.
   - `shuffleIds(ids, rng)` - Fisher-Yates using injected `rng` (deterministic in tests).
   - `reconcileOrder(order, ids)` - keep `order` entries still present (in their order), drop the
     gone ones, append `ids` new to it at the end. Self-heals the frozen shuffle order as the
     playlist changes (E-5/E-6).
   - `decideOnEnded(order, activeId, mode)` - the ADT decision (repeat-one -> replay; computed next
     == active -> replay; off + last -> stop; else advance).

2. **Context wiring** (`workspace-context.tsx`):
   - State: `repeatMode` (default `"off"`), `isShuffling` (default `false`), `shuffleOrder`
     (`string[]`, default `[]`). New optional prop `rng = Math.random` (test seam).
   - `effectiveOrder` = `isShuffling ? reconcileOrder(shuffleOrder, playlistIds) : playlistIds`
     (`playlistIds` = `playlist.map(v => v.id)`), memoized.
   - `stepVideo` walks `effectiveOrder` instead of `playlist` (Next/Prev follow shuffle - AC-005).
   - `reportEnded` = `decideOnEnded(effectiveOrder, activeVideoId, repeatMode)` then map:
     `advance` -> `activate(id)`; `replay` -> `setSeekToSec(0)` + `setPlaybackCurrentSec(0)` +
     `setIsPlaying(true)`; `stop` -> `setIsPlaying(false)`. Guard: no active -> return (E-1).
   - `cycleRepeat()` -> `setRepeatMode(nextRepeatMode)`.
   - `toggleShuffle()` -> flips `isShuffling`; on turning ON, freeze
     `setShuffleOrder(shuffleIds(playlistIds, rng))`. Does NOT touch active/isPlaying (AC-006).
   - Add `repeatMode`, `isShuffling`, `cycleRepeat`, `toggleShuffle` to the context type + value +
     memo deps.

3. **Transport UI** (`transport-bar.tsx`): two `BAR_BUTTON` cells after Next - `Shuffle` toggle
   (`aria-pressed={isShuffling}`, `aria-label="Shuffle"`, dim/bright icon) and a repeat cycle
   button (`aria-label={"Repeat: " + repeatMode}`, `Repeat`/`Repeat1` glyph, dim when off).

4. **Actions** (`registry.ts` + `workspace.tsx`): two new `ShortcutActionId`s `toggle-shuffle`
   (`S`) and `cycle-repeat` (`R`); register handlers; they flow into the palette automatically
   (the existing `SHORTCUT_ACTIONS.map` builds palette commands).

## Files

### Create
- `src/components/workspace/queue.ts` - the pure module (types + 4 fns).
- `src/components/workspace/__tests__/queue.test.ts` - pure unit tests (TC-010..TC-012).

### Modify
- `src/components/workspace/workspace-context.tsx` - state + verbs + effectiveOrder; `stepVideo`
  and `reportEnded` use it.
- `src/components/workspace/transport-bar.tsx` - shuffle + repeat buttons.
- `src/lib/shortcuts/registry.ts` - `toggle-shuffle` (`S`), `cycle-repeat` (`R`) actions.
- `src/components/workspace/workspace.tsx` - handler entries for the two new actions.
- `src/components/workspace/__tests__/workspace-context.test.tsx` - Probe gains repeat/shuffle
  outputs + buttons; add TC-001..TC-009, TC-014 (and update the existing reportEnded test, which
  currently asserts "no auto-advance" - now repeat=off mid-list advances, so retarget it to the
  last-video stop case TC-002).
- `src/components/workspace/__tests__/transport-bar.test.tsx` - TC-013 (controls + state).
- `README.md` - workspace prose: replace "Not yet: ... auto-advance on end" with the queue
  behavior; add `S`/`R` to the hotkey list and shuffle/repeat to the palette list.
- `docs/adr.md` - row: repeat-enum + shuffle-toggle (orthogonal) over single cycling mode;
  stop-at-end default; shuffle order frozen-and-reconciled.
- `docs/learnings.md` - if any gotcha surfaces (e.g. replay needing seekToSec re-null).

### No change
- `viewport.tsx` - already calls `reportEnded()` on `onEnded` and resumes `play()` on `isPlaying`
  + `seekToSec` effects; replay reuses that path (E-7). No edit needed.

## Edge cases handled (from spec §6)

E-1 empty/no-active no-op (guards); E-2 single + repeat-all -> replay (next==active);
E-3 single + off -> stop; E-4 manual Next ignores repeat-one; E-5 append while shuffling ->
reconcile appends; E-6 sort change while shuffling -> frozen order; E-7 replay re-sets seekToSec=0
(reportProgress nulls it between plays so 0 is always a fresh state change).

## Tests (TDD, Vitest)

Pure (`queue.test.ts`):
- `nextRepeatMode` cycle off->all->one->off (TC-008 core).
- `decideOnEnded` matrix: advance / stop-at-last / wrap-all / replay-one / single+all replay (TC-010).
- `shuffleIds` permutation + determinism for fixed rng (TC-011).
- `reconcileOrder` drop-missing + append-new + preserve-order (TC-012).

Context (`workspace-context.test.tsx`, render-under-provider Probe, no SUT mocking):
- TC-001 advance mid-list; TC-002 stop at end; TC-003 repeat-all wrap; TC-004 repeat-one replay
  (assert current resets to 0 + playing); TC-005 shuffle Next/Prev round-trip (inject
  `rng` for order [b,a,c]); TC-006 shuffle auto-advance; TC-007 toggle shuffle keeps active+playing;
  TC-008 cycleRepeat x3 -> off; TC-009 manual Next ignores repeat-one; TC-014 empty no-op.

Transport (`transport-bar.test.tsx`):
- TC-013 shuffle pressed + repeat accessible name reflects `repeatMode` (render under a provider
  seeded via a small wrapper or context-driving buttons, matching the file's existing pattern).

Not unit-testable (needs real media + Tauri host): the actual `onEnded` firing from a finished
`<video>`. Covered by user `npm start` - play a short clip to the end and confirm the next plays;
toggle shuffle/repeat and watch order. jsdom can't fire a real media `ended`.

## Acceptance verification

Each AC maps to >=1 TC above; `decideOnEnded`/`shuffleIds` cover AC-009; lint+typecheck+test green
covers AC-010.

## Status: DONE 2026-06-20

All 10 ACs verified by a fresh-context verifier (twice - second pass confirmed three closed gaps).
Gates: `npm test` 245 passed (21 files), `npm run lint` 0 errors (4 pre-existing warnings),
`npm run typecheck` clean. Frontend only; no Rust change.

### AC -> proving test

| AC | Proving test(s) |
|----|-----------------|
| AC-001 | context "should advance to the next video and keep playing ... mid-list with repeat off"; queue `decideOnEnded` "advance ... not last" |
| AC-002 | context "should set isPlaying false and keep the active video ... last video with repeat off"; queue "stop ... active is last" |
| AC-003 | context "should wrap to the first video ... repeat all"; queue "advance to the first id ... all and last" |
| AC-004 | context "should replay the same video from 0 ... repeat one" (asserts current resets to 0) |
| AC-005 | context "should return to the same active video if Next then Prev ... shuffling"; "should auto-advance to the same id as Next ... shuffling with repeat all" |
| AC-006 | context "should keep the active video and isPlaying unchanged if shuffle is toggled on" |
| AC-007 | context "should cycle repeatMode off->all->one->off"; "should advance ... Next is called with repeat one"; queue `nextRepeatMode` cycle |
| AC-008 | transport "should render an unpressed shuffle control and a 'Repeat: off' control"; "should press the shuffle control and read 'Repeat: one'" |
| AC-009 | queue.test.ts: `nextRepeatMode`, `shuffleIds` (permutation + reorder-not-identity), `reconcileOrder`, `decideOnEnded` matrix |
| AC-010 | full suite + lint + typecheck green |

### Edge-case integration coverage

- E-5 append-while-shuffling: context "should append a dropped-in video to the shuffle order without reshuffling"
- E-6 sort-change-while-shuffling: context "should keep the frozen shuffle order if the sort direction is flipped" (seeded `initialSortKeys:["title"]` so the assertion discriminates frozen vs live order)

### Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-20 | repeat enum + orthogonal shuffle toggle; stop-at-end default; shuffle drives next/prev + auto-advance | User-chosen; logged in docs/adr.md. |
| 2026-06-20 | Frozen shuffle order reconciled (not reshuffled) on list/sort change | Append/sort must not reshuffle or lose the cursor; logged in docs/adr.md. |
