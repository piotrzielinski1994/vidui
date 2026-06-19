import { useHotkeys, type UseHotkeyDefinition } from "@tanstack/react-hotkeys";
import type { Hotkey } from "@tanstack/hotkeys";
import {
  SHORTCUT_ACTIONS,
  type ShortcutActionId,
} from "@/lib/shortcuts/registry";

export function useActionHotkeys(
  handlers: Partial<Record<ShortcutActionId, () => void>>,
): void {
  const definitions: UseHotkeyDefinition[] = SHORTCUT_ACTIONS.filter(
    (action) => handlers[action.id] !== undefined,
  ).map((action) => ({
    hotkey: action.defaultHotkey as Hotkey,
    callback: () => {
      handlers[action.id]?.();
    },
  }));

  useHotkeys(definitions, { ignoreInputs: true });
}
