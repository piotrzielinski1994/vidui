# Spec: Extended transport controls (seek, volume/mute, speed)

**Version:** 0.1.0
**Created:** 2026-06-20
**Status:** Draft

## 1. Overview

Add three families of fine-grained transport controls to the working player, all sharing the
same shape: a `WorkspaceProvider` field -> a `<video>` property synced in the viewport -> an
action-registry entry (global hotkey + command-palette command) -> transport-bar UI where
applicable -> tests.

1. **Relative seek** - jump the active video by a delta from its current position:
   - `ArrowRight` / `ArrowLeft` = +5s / -5s (coarse)
   - `Shift+ArrowRight` / `Shift+ArrowLeft` = +1s / -1s (fine)
   Reuses the existing absolute `seek`; `seekBy(delta)` computes `current + delta` and clamps.
2. **Volume + mute**:
   - `ArrowUp` / `ArrowDown` = +5% / -5% volume (0-100%)
   - `M` = toggle mute
   - Transport bar gains a **mute toggle button** + a **draggable volume slider**.
3. **Playback speed** (0.5x-2.0x):
   - `]` / `[` = +0.1 / -0.1 step
   - Hotkey + command-palette only (no button, per request). A passive rate readout appears
     in the transport bar **only when the rate is not 1x**.

Playback model unchanged. These are live element properties; volume/mute/rate persist on the
element across active-video switches (same element instance) and re-apply when it remounts.

What this delivers:
- New registry actions (each with a global hotkey AND a palette command):
  `seek-forward`, `seek-back`, `seek-forward-fine`, `seek-back-fine`,
  `volume-up`, `volume-down`, `toggle-mute`, `speed-up`, `speed-down`.
- `seekBy(delta)` on the context (clamped to `[0, duration]`).
- `volume` (0-1) + `isMuted` context state with `setVolume`/`changeVolume`/`toggleMute`;
  the `<video>` element's `volume`/`muted` synced from them.
- `playbackRate` context state (default 1) with `changeRate(delta)`; element `playbackRate` synced.
- Transport bar: mute button + volume slider (left zone) and a conditional rate readout (right zone).

What this does **not** deliver (out of scope):
- The discarded 3s / 30s seek granularities (only +-1s / +-5s ship - two levels, per decision).
- A speed button/menu (hotkey + palette only).
- Persisting volume/mute/rate across reloads (that is FR-7 settings).
- Auto-unmute when raising volume (mute and volume stay independent toggles).
- Per-file volume/speed memory.

### User Story

As a user I want to nudge the playhead, change volume, mute, and speed up/slow down playback
with the keyboard (and the command palette), and adjust volume with an on-screen slider, so I
can control playback precisely without leaving the keyboard.

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Registry has `seek-forward` (`ArrowRight`, +5s), `seek-back` (`ArrowLeft`, -5s), `seek-forward-fine` (`Shift+ArrowRight`, +1s), `seek-back-fine` (`Shift+ArrowLeft`, -1s). Each appears as a global hotkey AND a palette command. | Must |
| AC-002 | `seekBy(delta)` sets the playhead to `current + delta`, clamped to `[0, duration]` (lower bound 0; upper bound `duration` only when `duration > 0`); the viewport seeks the `<video>` element to that time. | Must |
| AC-003 | Registry has `volume-up` (`ArrowUp`, +5%) and `volume-down` (`ArrowDown`, -5%); each is a global hotkey AND a palette command. `changeVolume(delta)` clamps volume to `[0, 1]` and the `<video>` element's `volume` reflects it. | Must |
| AC-004 | The transport bar shows a volume slider: `role="slider"`, name "Volume", `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow=round(volume*100)`; clicking/dragging it sets volume (0-1) and the fill width reflects it. | Must |
| AC-005 | Registry has `toggle-mute` (`M`); global hotkey AND palette command. The transport bar shows a mute toggle button whose `aria-label` is "Mute" when not muted and "Unmute" when muted, and whose icon reflects state; clicking it (or `M`) toggles the `<video>` element's `muted`. | Must |
| AC-006 | Registry has `speed-up` (`]`, +0.1) and `speed-down` (`[`, -0.1); each is a global hotkey AND a palette command. `changeRate(delta)` steps `playbackRate` by the delta, rounded to 1 decimal and clamped to `[0.5, 2.0]`; the `<video>` element's `playbackRate` reflects it. A passive rate readout (e.g. "1.5x") is shown in the transport bar only when the rate != 1.0. | Must |
| AC-007 | Every new action is reachable BOTH as a global hotkey and as a command-palette entry (no on-screen button except the mute toggle and volume slider). | Must |
| AC-008 | With no active video, all new controls (seek/volume/mute/speed via hotkey, palette, button, or slider) are safe no-ops that throw nothing; the transport readout stays `--:-- / --:--`. | Must |
| AC-009 | `npm run lint`, `npm run typecheck`, and `npm test` exit 0. | Must |

## 3. User Test Cases

### TC-001: Coarse seek forward and back
**Precondition:** A video is active; progress reported as 30s of 60s.
**Steps:** Trigger `seek-forward` (ArrowRight), then `seek-back` twice (ArrowLeft).
**Expected:** Playhead goes 30 -> 35 -> 30 -> 25; the `<video>` `currentTime` follows.
**Maps to:** AC-001, AC-002.

### TC-002: Fine seek and lower clamp
**Precondition:** A video is active; progress reported as 0.5s of 60s.
**Steps:** Trigger `seek-back-fine` (Shift+ArrowLeft).
**Expected:** Playhead clamps to 0 (not negative).
**Maps to:** AC-001, AC-002.

### TC-003: Upper clamp at duration
**Precondition:** A video is active; progress reported as 59s of 60s.
**Steps:** Trigger `seek-forward` (ArrowRight, +5s).
**Expected:** Playhead clamps to 60 (duration), not 64.
**Maps to:** AC-002.

### TC-004: Volume up / down via hotkey
**Precondition:** A video is active; volume at default 1.0.
**Steps:** Trigger `volume-down` (ArrowDown) twice.
**Expected:** Volume = 0.90; slider `aria-valuenow=90`; `<video>` `volume=0.9`.
**Maps to:** AC-003, AC-004.

### TC-005: Volume slider drag
**Precondition:** A video is active.
**Steps:** Click the volume slider at its mid-point.
**Expected:** Volume = 0.5; `aria-valuenow=50`; `<video>` `volume=0.5`.
**Maps to:** AC-004.

### TC-006: Mute toggle
**Precondition:** A video is active; not muted.
**Steps:** Press `M` (or click the mute button), then again.
**Expected:** First press mutes (`<video>` `muted=true`, button label "Unmute"); second unmutes.
**Maps to:** AC-005.

### TC-007: Speed step + clamp + readout
**Precondition:** A video is active; rate 1.0 (no readout).
**Steps:** Trigger `speed-up` (`]`) five times.
**Expected:** Rate 1.0 -> 1.5; `<video>` `playbackRate=1.5`; readout shows "1.5x". Continuing past 2.0 clamps at 2.0; `speed-down` past 0.5 clamps at 0.5.
**Maps to:** AC-006.

### TC-008: No-active-video no-ops
**Precondition:** Empty playlist, nothing active.
**Steps:** Trigger every new hotkey; click the mute button and the volume slider.
**Expected:** Nothing throws; readout stays `--:-- / --:--`.
**Maps to:** AC-008.

### TC-009: Palette parity
**Precondition:** Workspace open.
**Steps:** Open the palette (Mod+K).
**Expected:** It lists a command for every new action (seek x4, volume x2, mute, speed x2).
**Maps to:** AC-007.

## 4. UI States

| State   | Behavior |
| ------- | -------- |
| Loading | Source set, metadata not loaded (duration 0): seek upper-clamp disabled; volume/mute/rate still apply to the element. |
| Empty   | No active video: controls are no-ops; mute button + volume slider render but do nothing; no rate readout; time `--:-- / --:--`. |
| Muted   | Mute button shows the muted icon + "Unmute" label; element `muted=true`. Volume slider still reflects `volume` (independent of mute). |
| Speed   | Rate readout ("1.5x") visible only when rate != 1.0; hidden at 1.0. |
| Success | All controls drive the element live. |

### Transport bar - extended (ASCII)

```
+================================================================+  <- seek progress (top border)
| [mute] [====vol=====]    [<<]  [ || ]  [>>]     1.5x 00:30/01:00 |
+----------------------------------------------------------------+
   left zone: mute toggle + volume slider    right zone: rate + time
```

(The `1.5x` segment is absent when rate is 1.0. Box edges are flush; the two
content columns - left controls, right readout - sit in the existing
`[1fr_auto_1fr]` transport grid.)

## 5. Data Model

New `WorkspaceProvider` state + verbs (context-owned, no prop drilling):

```ts
// relative seek (reuses absolute seek under the hood)
seekBy: (delta: number) => void;          // current + delta, clamp [0, duration]

// volume + mute (live element properties)
volume: number;                            // 0..1, default 1
isMuted: boolean;                          // default false
setVolume: (value: number) => void;        // absolute, clamp [0,1] (slider drag)
changeVolume: (delta: number) => void;     // relative, clamp [0,1] (hotkeys)
toggleMute: () => void;

// playback speed
playbackRate: number;                      // default 1, clamp [0.5, 2.0], 1-decimal steps
changeRate: (delta: number) => void;
```

Pure helpers (unit-tested in isolation):

```ts
// shared by the seek + volume sliders (pointer x -> 0..1 fraction of the bar)
fractionFromPointer(clientX: number, rect: { left: number; width: number }): number;

// clamp + 1-decimal rounding for the speed step
clampRate(rate: number): number;           // -> [0.5, 2.0], rounded to 1 decimal
```

New default bindings added to `SHORTCUT_ACTIONS`:

| id | hotkey | effect |
|----|--------|--------|
| `seek-forward` | `ArrowRight` | +5s |
| `seek-back` | `ArrowLeft` | -5s |
| `seek-forward-fine` | `Shift+ArrowRight` | +1s |
| `seek-back-fine` | `Shift+ArrowLeft` | -1s |
| `volume-up` | `ArrowUp` | +0.05 |
| `volume-down` | `ArrowDown` | -0.05 |
| `toggle-mute` | `M` | toggle mute |
| `speed-up` | `]` | +0.1 |
| `speed-down` | `[` | -0.1 |

No new Tauri IPC: all changes are frontend `<video>` properties.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | No active video | `seekBy`/`changeVolume`/`toggleMute`/`changeRate` no-op when `activeVideoId === null` |
| E-2 | Duration unknown (0) | `seekBy` lower-clamps to 0; no upper clamp (element clamps itself once metadata loads) |
| E-3 | Seek below 0 / above duration | clamp to `[0, duration]` |
| E-4 | Rapid repeated seek before next `timeupdate` | `seek` updates `playbackCurrentSec` synchronously, so the next `seekBy` reads the new value |
| E-5 | Volume below 0 / above 1 | clamp `[0, 1]` |
| E-6 | Rate stepping past bounds | clamp `[0.5, 2.0]`; float drift removed by 1-decimal rounding |
| E-7 | Mute while volume > 0 | independent: mute sets `muted`, volume unchanged; raising volume does NOT auto-unmute |
| E-8 | Active-video switch | element keeps its `volume`/`muted`/`playbackRate`; re-applied on element remount |
| E-9 | Arrow hotkeys while palette open | `useHotkeys({ ignoreInputs: true })` already suppresses them when the cmdk input is focused, so arrows navigate the list |

## 7. Dependencies

Reused only: `@tanstack/react-hotkeys` (`ArrowLeft/Right/Up/Down`, `Shift+Arrow`, `M`, `[`, `]`
are all valid key tokens), the existing shortcut registry + `useActionHotkeys` + command
palette, shadcn `Button`, Tailwind tokens, `lucide-react` (`Volume2`, `VolumeX`). No new
packages, no Rust/Tauri changes.

## 8. Out of Scope

- 3s / 30s seek steps; speed button/menu; persistence (FR-7); per-file memory; auto-unmute.

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-20 | Initial draft - relative seek (+-1/+-5s), volume + mute, playback speed |
