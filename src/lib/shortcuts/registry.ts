export type ShortcutActionId =
  | "open-command-palette"
  | "open-files"
  | "toggle-play"
  | "next-video"
  | "prev-video"
  | "toggle-sort-direction"
  | "toggle-sidebar"
  | "toggle-transport";

export type ShortcutAction = {
  id: ShortcutActionId;
  name: string;
  description: string;
  defaultHotkey: string;
};

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  {
    id: "open-command-palette",
    name: "Open command palette",
    description: "Search and run any action from a command list.",
    defaultHotkey: "Mod+K",
  },
  {
    id: "open-files",
    name: "Open files",
    description: "Open video files and load them into the playlist.",
    defaultHotkey: "Mod+O",
  },
  {
    id: "toggle-play",
    name: "Play / pause",
    description: "Toggle playback of the active video.",
    defaultHotkey: "Space",
  },
  {
    id: "next-video",
    name: "Next video",
    description: "Activate the next video in the current order.",
    defaultHotkey: "Mod+Right",
  },
  {
    id: "prev-video",
    name: "Previous video",
    description: "Activate the previous video in the current order.",
    defaultHotkey: "Mod+Left",
  },
  {
    id: "toggle-sort-direction",
    name: "Toggle sort direction",
    description: "Flip the playlist between ascending and descending order.",
    defaultHotkey: "Mod+Shift+S",
  },
  {
    id: "toggle-sidebar",
    name: "Toggle sidebar",
    description: "Show or hide the playlist sidebar.",
    defaultHotkey: "Mod+B",
  },
  {
    id: "toggle-transport",
    name: "Toggle transport bar",
    description: "Show or hide the transport bar.",
    defaultHotkey: "Mod+J",
  },
];
