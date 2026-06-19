# Learnings

Project-specific conventions, gotchas, and constraints worth recording so future-you (human or agent) doesn't re-derive them. Append-only. For architectural trade-offs use [adr.md](adr.md) instead.

## Entries

<!-- Format: one bullet per learning. Date prefix optional. -->

- `nvm` on this machine is shimmed to print "use `mise` instead" and does nothing; node is managed by mise (`.nvmrc` pins 24, mise has 24.17.0). In non-interactive bash, activate first: `eval "$(mise activate bash)"` then `mise exec -- <cmd>` to get node 24.
- TanStack Hotkeys: `@tanstack/react-hotkeys` provides the React `useHotkeys` + `HotkeysProvider` (the framework-agnostic core is the separate `@tanstack/hotkeys`). Hotkey strings are case-sensitive uppercase, e.g. `"Mod+K"`. Under jsdom the lib resolves `Mod` to `Control` (test platform reports non-mac), so hotkey tests fire `{Control>}k{/Control}`, not Meta.
- shadcn Button keeps `react-refresh/only-export-components` as an accepted lint *warning* (the canonical upstream file exports `buttonVariants` alongside the component). Lint exits 0 with that one warning.
- Vite dev server uses `strictPort: true` on **1432** (Tauri requirement; HMR fallback 1433). Moved off 1420 specifically because the sibling `requi` repo dev-serves on 1420 - same-port clashes meant a headless screenshot of localhost:1420 could silently capture requi's app instead. Both the vite `server.port` and tauri.conf.json `devUrl` must agree. Also: a `npm run dev` started with `&` in a Bash tool call dies when that call's shell exits - launch it with the tool's `run_in_background` instead so it survives across calls.
- Radix `DropdownMenu` is modal: while open it sets `aria-hidden` on the trigger, so a test that re-opens the menu between selections only works if the menu CLOSES on each select (the default). Don't `preventDefault` on `onSelect` of a `DropdownMenuCheckboxItem` if tests rely on reopening - keep the close-on-select default and let `onCheckedChange` toggle state. Multi-select is achieved by reopening, not by keeping the menu open.
