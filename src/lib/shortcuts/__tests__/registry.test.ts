import { describe, it, expect } from "vitest";

import { SHORTCUT_ACTIONS } from "@/lib/shortcuts/registry";

describe("shortcut registry", () => {
  // behavior: registry is the single source of truth; the palette opener is part of it (AC-003)
  it("should include an 'open-command-palette' action bound to Mod+K if read", () => {
    const opener = SHORTCUT_ACTIONS.find(
      (action) => action.id === "open-command-palette",
    );

    expect(opener).toBeDefined();
    expect(opener?.defaultHotkey).toBe("Mod+K");
  });

  // behavior: visibility toggles are registered with requi-matching bindings (AC-003)
  it("should bind 'toggle-sidebar' to Mod+B and 'toggle-transport' to Mod+J if read", () => {
    const sidebar = SHORTCUT_ACTIONS.find(
      (action) => action.id === "toggle-sidebar",
    );
    const transport = SHORTCUT_ACTIONS.find(
      (action) => action.id === "toggle-transport",
    );

    expect(sidebar?.defaultHotkey).toBe("Mod+B");
    expect(transport?.defaultHotkey).toBe("Mod+J");
  });

  // behavior: action ids must be unique so each maps to exactly one handler/binding (AC-003)
  it("should expose a unique id for every registered action if enumerated", () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  // behavior: every action is displayable + bindable -> non-empty name and defaultHotkey (AC-003)
  it("should give every action a non-empty name and defaultHotkey if enumerated", () => {
    expect(SHORTCUT_ACTIONS.length).toBeGreaterThan(0);

    SHORTCUT_ACTIONS.forEach((action) => {
      expect(action.name.trim().length).toBeGreaterThan(0);
      expect(action.defaultHotkey.trim().length).toBeGreaterThan(0);
    });
  });
});
