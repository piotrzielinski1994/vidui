# Plan: Extended transport controls

Implements [spec.md](spec.md). TDD red-green-refactor. Branch: `20260620154106-extended-transport-controls`.

## Approach

Each control follows the established shape (matching the existing seek/play wiring):
context field/verb -> `<video>` property synced in `Viewport` via an effect -> registry action
(global hotkey + palette command) -> transport-bar UI where applicable.

- **Relative seek**: add `seekBy(delta)` to the context. It reads the live `playbackCurrentSec`,
  computes `current + delta`, clamps to `[0, duration]` (no upper clamp when duration is 0),
  and delegates to the existing `seek(sec)` (which sets `playbackCurrentSec` + `seekToSec`). The
  viewport already syncs `seekToSec -> video.currentTime`, so no viewport change is needed for seek.
- **Volume + mute**: context owns `volume` (0-1, default 1) and `isMuted` (default false), with
  `setVolume` (absolute), `changeVolume` (relative), `toggleMute`. The viewport adds an effect
  syncing `element.volume = volume` and `element.muted = isMuted`. Transport bar gains a mute
  `Button` + a pointer-driven volume slider (mirrors the existing seek slider's pointer handling).
- **Playback speed**: context owns `playbackRate` (default 1) + `changeRate(delta)` using a pure
  `clampRate` helper ([0.5, 2.0], 1-decimal). Viewport effect syncs `element.playbackRate`.
  Transport bar shows a passive rate readout only when `playbackRate !== 1`.
- **Registry/wiring**: 9 new actions in `SHORTCUT_ACTIONS`; `Workspace` maps each id to its
  context verb in `handlers` (which feeds BOTH `useActionHotkeys` and the palette command list -
  so palette parity is automatic). No-active-video guards live in the context verbs.
- **Pure helpers**: extract `fractionFromPointer` (shared by both sliders) from the existing
  `seekSecondsFromPointer`; add `clampRate`. Both unit-tested.

## Files

### Create
- `src/components/workspace/clamp-rate.ts` - pure `clampRate(rate)`.
- `src/components/workspace/__tests__/clamp-rate.test.ts` - unit tests (RED).
- `src/components/workspace/volume-position.ts` OR fold into `seek-position.ts` as a shared
  `fractionFromPointer`; `seekSecondsFromPointer` then becomes `fraction * duration`.
- `src/components/workspace/__tests__/extended-transport.test.tsx` - new integration tests
  (seek deltas/clamps, volume hotkey+slider, mute, speed) under a real provider+viewport+bar.

### Modify
- `src/lib/shortcuts/registry.ts` - add the 9 actions + extend `ShortcutActionId` union.
- `src/components/workspace/workspace-context.tsx` - add `volume`/`isMuted`/`playbackRate` state
  and `seekBy`/`setVolume`/`changeVolume`/`toggleMute`/`changeRate` verbs (+ context type + deps).
- `src/components/workspace/viewport.tsx` - effects syncing `volume`/`muted`/`playbackRate` to
  the `<video>` element (alongside the existing isPlaying + seek effects).
- `src/components/workspace/transport-bar.tsx` - mute button + volume slider (left zone) and the
  conditional rate readout (right zone).
- `src/components/workspace/seek-position.ts` - extract shared `fractionFromPointer`.
- `src/components/workspace/workspace.tsx` - wire the 9 new handlers (hotkeys + palette commands).
- Existing tests that count/enumerate transport buttons or palette rows, if any assert exact
  counts (none currently assert totals; the seek-slider test uses `getAllByRole(slider).toHaveLength(1)`
  -> update to scope by name, since a Volume slider is added).

### Test setup
- No jsdom stub needed: jsdom natively backs `volume`/`muted`/`playbackRate` getters+setters
  (confirmed). Pointer-capture + currentTime stubs already exist in `src/test/setup.ts`.

## Execution order

1. **RED** (test-writer subagent): unit tests for `clampRate` + `fractionFromPointer`; registry
   tests for the 9 actions/bindings; context tests for `seekBy` clamps, `changeVolume`/`setVolume`
   clamps, `toggleMute`, `changeRate` clamps + no-active no-ops; viewport/transport tests for
   element `volume`/`muted`/`playbackRate` sync, volume slider aria + drag, mute button label,
   rate readout visibility; palette-parity test. All fail.
2. **GREEN**: helpers -> registry -> context -> viewport sync -> transport UI -> workspace wiring.
   One commit per AC where it maps cleanly.
3. **REFACTOR**: dedupe slider pointer logic; tidy; keep green.
4. **VERIFY**: fresh verifier subagent; lint/typecheck/test. Manual `npm start` smoke for real
   audio volume/mute/speed (jsdom can't exercise real playback).

## Edge cases (from spec)

E-1 no active -> verbs no-op. E-2 duration 0 -> seek lower-clamp only. E-3 seek clamp [0,dur].
E-4 synchronous current update. E-5 volume clamp [0,1]. E-6 rate clamp [0.5,2] + 1-decimal.
E-7 mute independent of volume. E-8 element keeps props across switch. E-9 palette-open arrows
suppressed by `ignoreInputs`.

## Tests to write (>= 1 per AC)

AC-001 registry seek x4 bindings; AC-002 `seekBy` add+clamp both bounds (context + viewport
currentTime); AC-003 registry volume x2 + `changeVolume` clamp + element sync; AC-004 volume
slider aria + drag; AC-005 registry mute + button label toggle + element `muted`; AC-006 registry
speed x2 + `changeRate` clamp + element `playbackRate` + readout visibility; AC-007 palette lists
all 9; AC-008 no-active no-ops; AC-009 gates. Helper units: `clampRate` bounds/rounding,
`fractionFromPointer` clamp.

## Acceptance verification

Verifier subagent (fresh context) maps every AC -> test, runs lint/typecheck/test, probes edges.
Manual: `npm start`, confirm real volume/mute/speed/seek with a file.

### Status: DONE (verifier PASS, all gates green)

Gates: `npm test` 197 pass (18 files), `npm run typecheck` clean, `npm run lint` 0 errors
(4 accepted baseline warnings, unchanged from base), `cargo test` 2 pass. Manual `npm start`
smoke still recommended for real audio volume/mute + speed/seek (jsdom can't exercise real playback).

### AC -> test traceability

| AC | Test(s) (`extended-transport.test.tsx` unless noted) |
|----|---------|
| AC-001 | "should register seek-forward and seek-back..." + "...fine seek variants bound to Shift+Arrow"; palette parity (AC-007) |
| AC-002 | "should move the playhead to current+delta...", "...clamp to 0...", "...clamp to the duration...", "...drive the video element currentTime..."; edge "...lower-clamp only... unknown duration" (E-2) |
| AC-003 | "should register volume-up and volume-down...", "...default volume to 1...", "...lower the element volume to 0.9...", "...clamp the volume to 0...", "...clamp the volume to 1..." |
| AC-004 | "should expose a Volume slider with min 0, max 100...", "...valuenow to 90...", "...set volume to 0.5 if the volume slider is clicked..." |
| AC-005 | "should register toggle-mute bound to M", "...label the mute button 'Mute'...", "...mute the element and relabel...", "...unmute... twice", "...leave the volume unchanged if... muted" (E-7) |
| AC-006 | "should register speed-up bound to ] and speed-down bound to [", "...step... to 1.5...", "...clamp... to 2...", "...clamp... to 0.5...", "...not show a rate readout if... 1", "...show a '1.5x' readout..."; `clamp-rate.test.ts` (bounds + 1-decimal rounding) |
| AC-007 | "should list a palette command for each new action if the palette is open" |
| AC-008 | "should not throw and should keep volume/rate at defaults...", "...keep the readout at --:-- / --:--...", "...mute button and volume slider... with no active video" |
| AC-009 | all gates green |
| (E-8) | "should keep volume, mute and rate if the active video is switched" |

Helper units: `clamp-rate.test.ts`, `seek-position.test.ts` (`fractionFromPointer`).
Hotkey-drives-element: "...ArrowRight...", "...M...", "...] is pressed in the workspace".

## Risks

- jsdom no real audio: assert element properties + context state, not audible output. Manual smoke covers real audio.
- `ArrowUp/Down/Left/Right` as bare hotkeys could clash with palette list navigation -> mitigated by `ignoreInputs: true` (arrows only fire when no input is focused).
- Adding a second `role="slider"` breaks the existing `getAllByRole("slider").toHaveLength(1)` assertion -> update that test to scope sliders by accessible name.
