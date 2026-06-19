# Plan: Command Palette

**Spec:** [spec.md](spec.md)
**Branch:** `20260620000259-command-palette`
**Coverage threshold:** none (vitest config enforces no threshold)

## Approach

Port requi's palette structure, stripped of its persistence/override layer (fixed-defaults scope):

- Registry is the single source of truth (`SHORTCUT_ACTIONS`). No `resolve.ts` / overrides /
  `useSettings` - bindings are read straight from `action.defaultHotkey`.
- `use-action-hotkeys.ts` registers each action's `defaultHotkey` via `useHotkeys` with
  `ignoreInputs: true` (so typing in the palette search doesn't re-trigger `Mod+K`).
- The palette is mounted in a small `Workspace` shell wrapper that owns `isPaletteOpen` and
  builds the `PaletteCommand[]` from the registry + `useWorkspace()` verbs. This keeps
  `WorkspaceLayout` purely presentational and gives the hooks a home inside `WorkspaceProvider`.
- UI primitives (`command.tsx`, `dialog.tsx`) ported from requi but switched to vidui's
  `radix-ui` umbrella import convention (`import { Dialog as DialogPrimitive } from "radix-ui"`).

### Key decisions

- **Fixed defaults, no persistence** (user-chosen scope). Drop `resolve.ts`, `findConflict`,
  settings-context, Tauri keymap store, shortcuts-editor. Recorded in Decision Log.
- **Palette wired to existing verbs only**: `togglePlay`, `nextVideo`, `prevVideo`,
  `toggleSortDirection` from `useWorkspace()`. No new verbs, no router-nav commands.
- **New `Workspace` wrapper** (`workspace.tsx`) owns palette state + hotkeys and renders
  `WorkspaceLayout` + `CommandPalette`. `routes/index.tsx` renders `<Workspace />` inside the
  existing `WorkspaceProvider`.
- **`radix-ui` umbrella import** for Dialog, matching vidui's existing `dropdown-menu.tsx`
  (requi uses `@radix-ui/react-dialog` directly; vidui standardizes on the umbrella).

## Files

### New

| File | Purpose |
|------|---------|
| `src/components/ui/dialog.tsx` | shadcn Dialog (radix umbrella import). Used by CommandDialog. |
| `src/components/ui/command.tsx` | `cmdk` wrapper: Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandItem, CommandShortcut. |
| `src/lib/shortcuts/registry.ts` | `ShortcutActionId`, `ShortcutAction`, `SHORTCUT_ACTIONS`. |
| `src/lib/shortcuts/use-action-hotkeys.ts` | Binds each action's `defaultHotkey` globally via `useHotkeys({ ignoreInputs: true })`. |
| `src/components/workspace/command-palette.tsx` | `CommandPalette` + `PaletteCommand` type; renders registry rows with `formatForDisplay(binding)`. |
| `src/components/workspace/workspace.tsx` | Shell: owns `isPaletteOpen`, builds commands from registry + `useWorkspace()`, wires `useActionHotkeys`, renders `WorkspaceLayout` + `CommandPalette`. |
| `src/lib/shortcuts/__tests__/registry.test.ts` | Registry invariants (AC-003 source-of-truth). |
| `src/components/workspace/__tests__/command-palette.test.tsx` | Palette rendering/filter/run (AC-003,004,005). |
| `src/components/workspace/__tests__/workspace-palette.test.tsx` | Integration: Mod+K open/close + run via palette + global hotkey (AC-001,002,005,006,008). |

### Modified

| File | Change |
|------|--------|
| `package.json` | Add `cmdk@^1.1.1` dependency. |
| `src/routes/index.tsx` | Render `<Workspace />` inside `WorkspaceProvider` (replaces direct `<WorkspaceLayout />`). |

## Edge cases to handle

- E-1: transport verbs already guard empty/no-active; palette lists + closes regardless (AC-008).
- E-2: `ignoreInputs: true` stops `Mod+K` re-trigger while typing in the search box.
- E-3: `CommandEmpty` renders "No matching commands".
- E-4: opening when open is idempotent (`setIsPaletteOpen(true)`).
- E-5: `onSelect` runs the handler then `onOpenChange(false)` - single run.

## Tests to write (RED first)

Behavior-first, `it("should X if Y")`, rendered through `WorkspaceProvider` + fixtures (reuse
`__tests__/fixtures.ts`). One+ test per AC:

- registry.test.ts: `open-command-palette` exists with `Mod+K`; ids unique; every id has a
  non-empty `defaultHotkey` and `name`. (AC-003)
- command-palette.test.tsx: renders a row per command with name + formatted shortcut (AC-003);
  filters by typed text (AC-004); shows empty state on no match (AC-004); Enter runs handler +
  closes (AC-005); click runs handler + closes (AC-005).
- workspace-palette.test.tsx: `Mod+K` opens, `Escape` closes (AC-001/002); "open command palette"
  not listed (AC-003); running "Play / pause" via palette toggles isPlaying + closes (AC-005);
  pressing the next-video hotkey advances active video without opening palette (AC-006); running
  "Next video" with no active video is a no-op + closes (AC-008).

## Acceptance verification

After GREEN + REFACTOR, a fresh verifier subagent runs `npm run lint`, `npm run typecheck`,
`npm test`, maps each AC to a test asserting real behavior, and adversarially probes E-1..E-5.
Loop until all PASS. Then write the AC -> test-name traceability table into the task notes.

## Risks

- `cmdk` + jsdom focus/portal quirks in tests: mitigate with `@testing-library/user-event` and
  `findBy*`/`waitFor`; assert on visible text/roles, mirror requi's passing palette tests.
- `@tanstack/react-hotkeys` `Mod+K` simulation in jsdom: if key dispatch is flaky, drive open
  state directly in the unit test and cover the real keypress in the integration test only.
- `radix-ui` umbrella Dialog subpath differences vs requi's `@radix-ui/react-dialog`: verified
  the umbrella exports `Dialog`; mirror the existing `dropdown-menu.tsx` import shape.

## Status: DONE

Implemented TDD red-green-refactor. Fresh verifier (clean context) returned PASS on all ACs
and all 3 gates. `npm run lint` (0 errors, 3 pre-existing warnings), `npm run typecheck` (clean),
`npm test` (95/95 pass).

Scope was extended after the initial 9-AC version: AC-010 (Toggle sidebar, `Mod+B`) and AC-011
(Toggle transport bar, `Mod+J`) were added per user request. These introduced the first new
workspace state in this feature: `isSidebarVisible` / `isTransportVisible` (default `true`) +
`toggleSidebar` / `toggleTransport` verbs in `WorkspaceProvider`, consumed by `WorkspaceLayout`
(drops the sidebar panel + handle when hidden) and `Content` (omits `<TransportBar/>` when
hidden). Decision: visibility lives in the workspace context, not local `Workspace` state, to
keep the "shared, no prop drilling" invariant and let any panel read it.

### AC -> test traceability

| AC | Test |
|----|------|
| AC-001 | workspace-palette.test.tsx > "should open the palette if Mod+K is pressed in the workspace" |
| AC-002 | workspace-palette.test.tsx > "should close the palette if Escape is pressed while it is open" |
| AC-003 | registry.test.ts (3 invariants) + command-palette.test.tsx > "should render a row per command with its name and formatted shortcut if open" + workspace-palette.test.tsx > "should not list the 'open command palette' action as a row if the palette is open" |
| AC-004 | command-palette.test.tsx > "should narrow the list to matching commands..." + "should show 'No matching commands'..." |
| AC-005 | command-palette.test.tsx > "should run the selected command once and close if Enter is pressed..." + "...if a row is clicked" + workspace-palette.test.tsx > "should toggle playback and close the palette if 'Play / pause' is selected" |
| AC-006 | workspace-palette.test.tsx > "should advance the active video in sorted order if the next-video hotkey is pressed without the palette open" |
| AC-007 | No dedicated test (visual). Verified structurally: requi-identical palette source + shadcn tokens (bg-popover, data-[selected=true]:bg-accent) defined light/dark in index.css. |
| AC-008 | workspace-palette.test.tsx > "should not throw and should close if 'Next video' is run with no active video" |
| AC-009 | lint + typecheck + test gates all green |
| AC-010 | registry.test.ts > "should bind 'toggle-sidebar' to Mod+B..." + workspace-context.test.tsx > "should flip only sidebar visibility..." / "should restore the sidebar if toggleSidebar is called twice" + workspace-palette.test.tsx > "should hide the sidebar and close the palette if 'Toggle sidebar' is selected" / "should hide the sidebar if the toggle-sidebar hotkey is pressed..." |
| AC-011 | registry.test.ts > "...and 'toggle-transport' to Mod+J" + workspace-context.test.tsx > "should flip only transport visibility..." + workspace-palette.test.tsx > "should hide the transport bar and close the palette if 'Toggle transport bar' is selected" / "should hide the transport bar if the toggle-transport hotkey is pressed..." |

### Deviations from plan

- `src/test/setup.ts`: added a `scrollIntoView` no-op polyfill (cmdk needs it under jsdom). Not
  anticipated in the plan; mirrors requi's setup. Logged in learnings.
- `tests/e2e/bootstrap.spec.tsx`: the layout feature's AC-014 tests asserted the palette was
  REMOVED. Re-flipped the two stale assertions (palette now opens on Mod+K) to match this feature.
- Test-writer dispatched `{Meta>}` for Mod+K; corrected to `{Control>}` (jsdom resolves Mod to
  Control - see learnings). Production code is unchanged and correct.
