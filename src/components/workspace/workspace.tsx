import { useEffect, useState } from "react";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import {
  CommandPalette,
  type PaletteCommand,
} from "@/components/workspace/command-palette";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { videosFromPaths } from "@/components/workspace/videos-from-paths";
import {
  openVideoFiles,
  watchFullscreen,
  watchWindowFocus,
} from "@/lib/tauri";
import { useActionHotkeys } from "@/lib/shortcuts/use-action-hotkeys";
import {
  SHORTCUT_ACTIONS,
  type ShortcutActionId,
} from "@/lib/shortcuts/registry";

export function Workspace() {
  const {
    loadVideos,
    togglePlay,
    nextVideo,
    prevVideo,
    toggleSortDirection,
    toggleSidebar,
    toggleTransport,
    setFullscreen,
  } = useWorkspace();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // Drive isFullscreen from the REAL window state (every path: native F11, green
  // button, double-click) and re-arm the WKWebView first responder on each
  // transition + focus gain so keyboard input survives fullscreen (tao#208).
  useEffect(() => {
    const fsPromise = watchFullscreen(setFullscreen);
    const focusPromise = watchWindowFocus();
    return () => {
      void fsPromise.then((unlisten) => unlisten());
      void focusPromise.then((unlisten) => unlisten());
    };
  }, [setFullscreen]);

  const openFiles = async () => {
    const paths = await openVideoFiles();
    if (paths.length === 0) {
      return;
    }
    loadVideos(videosFromPaths(paths));
  };

  const handlers: Partial<Record<ShortcutActionId, () => void>> = {
    "open-files": () => void openFiles(),
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
