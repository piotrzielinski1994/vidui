# Spec: Command Palette

**Version:** 0.1.0
**Created:** 2026-06-20
**Status:** Draft

## 1. Overview

Add a command palette to the workspace, modeled on `requi`'s palette: a `cmdk`-backed modal
that lists runnable actions, opens on `Mod+K`, filters by typed text, and runs the selected
action on Enter/click. Each action is also bound as a global keyboard shortcut. Bindings are
**fixed defaults** - no user-editable keymap, no persistence, no settings editor (those exist
in `requi` on top of a settings/Tauri-store layer that vidui does not have yet).

The layout feature explicitly removed the bootstrap command palette; this re-introduces it as a
real, registry-driven feature wired to vidui's workspace verbs.

What this delivers:
- A `cmdk` palette (search input + filtered list + empty state) styled with vidui's shadcn
  tokens, light/dark aware, matching requi's palette look.
- An action registry (`id`, `name`, `description`, `defaultHotkey`) - the single source of truth.
- Global hotkeys: `Mod+K` opens the palette; each registered action has its own global binding.
- Palette commands wired to workspace verbs: play/pause, next, previous, toggle sort direction,
  toggle sidebar, toggle transport bar. The first four already existed; sidebar/transport
  visibility state + verbs are added by this feature (the only new workspace state introduced).

What this does **not** deliver (out of scope):
- No user-editable keybindings, no conflict detection, no persistence (no Tauri keymap store).
  Panel visibility resets to "both shown" on reload (in-memory only).
- No settings page / shortcuts editor.
- No router-navigation commands (e.g. "open settings"): the `/settings` page is an empty stub;
  the palette mounts inside the workspace only.

### User Story

As a user of the player, I want to press `Mod+K` and search/run any workspace action from a
single list (or use its direct shortcut), so I can drive the app from the keyboard without
hunting for buttons.

### Approved layout (ASCII)

Centered modal over a dimmed overlay; search input on top, scrollable action list below, each
row = action name (left) + formatted shortcut (right):

```
              +--------------------------------------------+
              | (s) Type a command...                      |
              +--------------------------------------------+
              | Play / pause                       Cmd+P    |
              | Next video                         Cmd+>    |
              | Previous video                     Cmd+<    |
              | Toggle sort direction              Cmd+S    |
              | Toggle sidebar                     Cmd+B    |
              | Toggle transport bar               Cmd+J    |
              +--------------------------------------------+

  (no match)  +--------------------------------------------+
              | (s) frobnicate                             |
              +--------------------------------------------+
              |           No matching commands             |
              +--------------------------------------------+
```

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Pressing `Mod+K` while in the workspace opens the command palette modal | Must |
| AC-002 | Pressing `Escape` (or clicking the overlay) closes the palette and returns focus to the workspace | Must |
| AC-003 | The palette lists every registered action except "open command palette" itself; each row shows the action name and its formatted keyboard shortcut | Must |
| AC-004 | Typing in the palette filters the list by action name; when nothing matches, a "No matching commands" empty state is shown | Must |
| AC-005 | Selecting a command (Enter or click) runs its action exactly once and closes the palette | Must |
| AC-006 | Each registered action is also bound as a global hotkey; pressing it outside an input runs the same handler (palette need not be open) | Must |
| AC-007 | The palette uses vidui's shadcn tokens (popover/accent/muted), is light/dark aware, and matches requi's palette structure | Must |
| AC-008 | Running a transport command with no active video / empty playlist is a safe no-op (no throw, no state corruption) | Must |
| AC-009 | `npm run lint`, `npm run typecheck`, and `npm test` exit 0 | Must |
| AC-010 | "Toggle sidebar" (`Mod+B`) shows/hides the playlist sidebar; the viewport keeps rendering when it is hidden | Must |
| AC-011 | "Toggle transport bar" (`Mod+J`) shows/hides the transport bar; the viewport keeps rendering when it is hidden | Must |

## 3. User Test Cases

### TC-001: Open and close the palette
**Precondition:** Workspace loaded, focus not in a text input.
**Steps:** Press `Mod+K`; observe the modal; press `Escape`.
**Expected:** Palette opens with the search input focused and the action list visible; `Escape` closes it.
**Maps to:** AC-001, AC-002.

### TC-002: List shows actions with shortcuts
**Steps:** Open the palette.
**Expected:** Every wired action appears once, with its name and a formatted shortcut on the right; "open command palette" itself is not listed.
**Maps to:** AC-003.

### TC-003: Filter and empty state
**Steps:** Open the palette, type "next"; then type gibberish.
**Expected:** Typing "next" narrows the list to the matching action; gibberish shows "No matching commands".
**Maps to:** AC-004.

### TC-004: Run a command via the palette
**Precondition:** A video is active and paused.
**Steps:** Open the palette, select "Play / pause" (Enter).
**Expected:** Playback toggles to playing and the palette closes.
**Maps to:** AC-005, AC-006 (handler).

### TC-005: Run an action via its global hotkey
**Precondition:** First video active, ascending title sort.
**Steps:** Without opening the palette, press the "next video" shortcut.
**Expected:** The active video advances to the next in the current sorted order.
**Maps to:** AC-006.

### TC-006: No active video
**Precondition:** No active video.
**Steps:** Open the palette, run "Next video".
**Expected:** Nothing happens (no throw); palette closes.
**Maps to:** AC-008.

## 4. UI States

| State   | Behavior                                                                 |
| ------- | ------------------------------------------------------------------------ |
| Loading | N/A - palette content is synchronous (static registry).                  |
| Empty   | Filter matches no action -> "No matching commands" centered in the list. |
| Error   | N/A - no async/IO; transport no-ops are guarded (AC-008).                |
| Success | Full action list rendered; selecting a row runs the handler and closes.  |

## 5. Data Model

Action registry (single source of truth), no persistence:

```ts
type ShortcutActionId =
  | "open-command-palette"
  | "toggle-play"
  | "next-video"
  | "prev-video"
  | "toggle-sort-direction"
  | "toggle-sidebar"
  | "toggle-transport";

type ShortcutAction = {
  id: ShortcutActionId;
  name: string;          // shown in the palette + fuzzy-filter key
  description: string;
  defaultHotkey: string; // e.g. "Mod+K"; displayed via formatForDisplay
};

const SHORTCUT_ACTIONS: readonly ShortcutAction[];
```

Palette command (built per render from registry + workspace handlers):

```ts
type PaletteCommand = {
  action: ShortcutAction;
  binding: string;     // action.defaultHotkey
  run: () => void;     // bound workspace verb
};
```

Default bindings: `open-command-palette` = `Mod+K`, `toggle-play` = `Mod+P`,
`next-video` = `Mod+Right`, `prev-video` = `Mod+Left`, `toggle-sort-direction` = `Mod+Shift+S`,
`toggle-sidebar` = `Mod+B`, `toggle-transport` = `Mod+J`.

Visibility state (`isSidebarVisible`, `isTransportVisible`, both default `true`) lives in
`WorkspaceProvider` alongside the other UI state, with verbs `toggleSidebar` / `toggleTransport`
- keeping the "shared via context, no prop drilling" invariant. `WorkspaceLayout` drops the
sidebar panel + handle when hidden (content fills); `Content` omits `<TransportBar/>` when hidden.

## 6. Edge Cases

| # | Case | Handling |
|---|------|----------|
| E-1 | No active video / empty playlist when a transport command runs | Workspace verbs already guard (no-op); palette still lists + closes |
| E-2 | `Mod+K` pressed while focus is in the palette's search input | `useHotkeys({ ignoreInputs: true })` suppresses re-trigger; Escape still closes |
| E-3 | Filter text matches nothing | Empty state "No matching commands" |
| E-4 | `Mod+K` pressed when palette already open | Idempotent (stays open) |
| E-5 | Selecting a command | Runs once, then closes (no double-run) |

## 7. Dependencies

New dependency: `cmdk@^1.1.1` (matches requi). Already present and reused: `@tanstack/hotkeys` +
`@tanstack/react-hotkeys` (with `HotkeysProvider` already mounted in `app/providers.tsx`),
`radix-ui` (Dialog via the umbrella import - vidui convention, not requi's `@radix-ui/*`),
`lucide-react` (search/close icons), `class-variance-authority`, `clsx`, `tailwind-merge`.

## 8. Out of Scope

- User-editable keybindings, conflict detection, persistence (Tauri keymap store). Panel
  visibility is in-memory only (resets on reload).
- A settings page / shortcuts editor.
- Router-navigation commands; cross-route palette availability (palette mounts in the workspace).

## 9. Revision History

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-20 | Initial draft - palette ported from requi, fixed-defaults scope |
| 0.2.0 | 2026-06-20 | Added Toggle sidebar (Mod+B) + Toggle transport bar (Mod+J): new visibility state/verbs in WorkspaceProvider, conditional render in layout/content (AC-010, AC-011) |
