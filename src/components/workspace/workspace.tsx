import { useState } from "react";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import {
  CommandPalette,
  type PaletteCommand,
} from "@/components/workspace/command-palette";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { useActionHotkeys } from "@/lib/shortcuts/use-action-hotkeys";
import {
  SHORTCUT_ACTIONS,
  type ShortcutActionId,
} from "@/lib/shortcuts/registry";

export function Workspace() {
  const {
    togglePlay,
    nextVideo,
    prevVideo,
    toggleSortDirection,
    toggleSidebar,
    toggleTransport,
  } = useWorkspace();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const handlers: Partial<Record<ShortcutActionId, () => void>> = {
    "toggle-play": togglePlay,
    "next-video": nextVideo,
    "prev-video": prevVideo,
    "toggle-sort-direction": toggleSortDirection,
    "toggle-sidebar": toggleSidebar,
    "toggle-transport": toggleTransport,
  };

  useActionHotkeys({
    ...handlers,
    "open-command-palette": () => setIsPaletteOpen(true),
  });

  const commands: PaletteCommand[] = SHORTCUT_ACTIONS.filter(
    (action) => action.id !== "open-command-palette",
  )
    .map((action) => {
      const run = handlers[action.id];
      if (!run) {
        return null;
      }
      return { action, binding: action.defaultHotkey, run };
    })
    .filter((command): command is PaletteCommand => command !== null);

  return (
    <>
      <WorkspaceLayout />
      <CommandPalette
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        commands={commands}
      />
    </>
  );
}
