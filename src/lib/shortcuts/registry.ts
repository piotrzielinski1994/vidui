export type ShortcutActionId =
  | "open-command-palette"
  | "open-files"
  | "toggle-play"
  | "next-video"
  | "prev-video"
  | "seek-forward"
  | "seek-back"
  | "seek-forward-fine"
  | "seek-back-fine"
  | "volume-up"
  | "volume-down"
  | "toggle-mute"
  | "speed-up"
  | "speed-down"
  | "toggle-shuffle"
  | "cycle-repeat"
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
    id: "seek-forward",
    name: "Seek forward 5s",
    description: "Jump the active video forward by 5 seconds.",
    defaultHotkey: "ArrowRight",
  },
  {
    id: "seek-back",
    name: "Seek back 5s",
    description: "Jump the active video back by 5 seconds.",
    defaultHotkey: "ArrowLeft",
  },
  {
    id: "seek-forward-fine",
    name: "Seek forward 1s",
    description: "Jump the active video forward by 1 second.",
    defaultHotkey: "Shift+ArrowRight",
  },
  {
    id: "seek-back-fine",
    name: "Seek back 1s",
    description: "Jump the active video back by 1 second.",
    defaultHotkey: "Shift+ArrowLeft",
  },
  {
    id: "volume-up",
    name: "Volume up",
    description: "Raise playback volume by 5%.",
    defaultHotkey: "ArrowUp",
  },
  {
    id: "volume-down",
    name: "Volume down",
    description: "Lower playback volume by 5%.",
    defaultHotkey: "ArrowDown",
  },
  {
    id: "toggle-mute",
    name: "Mute / unmute",
    description: "Toggle mute on the active video.",
    defaultHotkey: "M",
  },
  {
    id: "speed-up",
    name: "Speed up",
    description: "Increase playback speed by 0.1x (up to 2x).",
    defaultHotkey: "]",
  },
  {
    id: "speed-down",
    name: "Speed down",
    description: "Decrease playback speed by 0.1x (down to 0.5x).",
    defaultHotkey: "[",
  },
  {
    id: "toggle-shuffle",
    name: "Toggle shuffle",
    description: "Shuffle the play order for next/prev and auto-advance.",
    defaultHotkey: "S",
  },
  {
    id: "cycle-repeat",
    name: "Cycle repeat",
    description: "Cycle repeat mode: off, all, then one.",
    defaultHotkey: "R",
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
