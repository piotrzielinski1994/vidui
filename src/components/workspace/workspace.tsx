import { useEffect, useState } from "react";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { DropOverlay } from "@/components/workspace/drop-overlay";
import {
  CommandPalette,
  type PaletteCommand,
} from "@/components/workspace/command-palette";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { videosFromPaths } from "@/components/workspace/videos-from-paths";
import {
  expandDroppedPaths,
  openVideoFiles,
  watchFileDrop,
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
    addVideos,
    togglePlay,
    nextVideo,
    prevVideo,
    seekBy,
    changeVolume,
    toggleMute,
    changeRate,
    toggleSortDirection,
    toggleSidebar,
    toggleTransport,
    setFullscreen,
  } = useWorkspace();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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

  // Drop files/folders onto the window -> expand (recurse folders + filter) in
  // Rust, then APPEND. The overlay tracks the live drag state.
  useEffect(() => {
    const dropPromise = watchFileDrop(async (event) => {
      if (event.type === "enter") {
        setIsDragging(true);
        return;
      }
      if (event.type === "leave") {
        setIsDragging(false);
        return;
      }
      setIsDragging(false);
      const paths = await expandDroppedPaths(event.paths);
      addVideos(videosFromPaths(paths));
    });
    return () => {
      void dropPromise.then((unlisten) => unlisten());
    };
  }, [addVideos]);

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
    "seek-forward": () => seekBy(5),
    "seek-back": () => seekBy(-5),
    "seek-forward-fine": () => seekBy(1),
    "seek-back-fine": () => seekBy(-1),
    "volume-up": () => changeVolume(0.05),
    "volume-down": () => changeVolume(-0.05),
    "toggle-mute": toggleMute,
    "speed-up": () => changeRate(0.1),
    "speed-down": () => changeRate(-0.1),
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
    <div className="relative h-full w-full">
      <WorkspaceLayout />
      {isDragging && <DropOverlay />}
      <CommandPalette
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        commands={commands}
      />
    </div>
  );
}
