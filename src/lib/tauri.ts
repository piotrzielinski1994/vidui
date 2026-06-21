import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "webm", "avi"];

export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

export async function openVideoFiles(): Promise<string[]> {
  const selection = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
  });
  if (selection === null) {
    return [];
  }
  return Array.isArray(selection) ? selection : [selection];
}

export type PreparedMedia = {
  path: string;
  transcoded: boolean;
  durationSec: number | null;
};

export type PreparedSource = { url: string; durationSec: number | null };

// Probe the file. If the webview can't decode it (e.g. AV1/VP9/Opus), the Rust
// side streams it as HLS and returns an http://localhost playlist URL, which the
// webview's native HLS player loads directly. A playable file instead comes back
// as a path, fed through the asset protocol. We branch on the URL scheme.
// `durationSec` is the real source length: an HLS stream's own duration reads
// Infinity until it ends, so the FE falls back to this for the transport readout.
export async function prepareMediaUrl(path: string): Promise<PreparedSource> {
  const prepared = await invoke<PreparedMedia>("prepare_media", { path });
  const isUrl =
    prepared.path.startsWith("http://") || prepared.path.startsWith("https://");
  return {
    url: isUrl ? prepared.path : convertFileSrc(prepared.path),
    durationSec: prepared.durationSec,
  };
}

// Send a preformatted playback-timeline line to the Rust log file (same file as
// the backend prepare_media diagnostics). Best-effort: a no-op outside a Tauri
// host and never throws, so instrumentation can't break playback.
export async function logPlayback(message: string): Promise<void> {
  try {
    await invoke("log_playback", { message });
  } catch {
    // no-op outside a Tauri host
  }
}

// Make the WKWebView the window's first responder again. macOS drops this after
// a fullscreen transition, killing keyboard input until a click - see the Rust
// focus_webview command (tao#208). No-op outside a Tauri host.
export async function focusWebview(): Promise<void> {
  try {
    await invoke("focus_webview");
  } catch {
    // no-op outside a Tauri host
  }
}

const NO_UNLISTEN = () => {};

// Subscribe to REAL window fullscreen transitions. We query isFullscreen() on
// every resize, so EVERY entry/exit path - our toggle, F11, the green button,
// OS Esc - keeps the flag correct (single source of truth). On each transition
// we also re-arm the WKWebView first responder, because macOS drops it across
// native fullscreen and keyboard input dies until a click (tao#208).
export function watchFullscreen(
  onChange: (isFullscreen: boolean) => void,
): Promise<() => void> {
  try {
    const appWindow = getCurrentWindow();
    void appWindow.isFullscreen().then(onChange);
    return appWindow.onResized(async () => {
      onChange(await appWindow.isFullscreen());
      void focusWebview();
    });
  } catch {
    return Promise.resolve(NO_UNLISTEN);
  }
}

// Re-arm first responder whenever the window (re)gains focus - catch-all for the
// native-fullscreen / green-button focus loss (tao#208).
export function watchWindowFocus(): Promise<() => void> {
  try {
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void focusWebview();
      }
    });
  } catch {
    return Promise.resolve(NO_UNLISTEN);
  }
}

// Expand dropped paths: the Rust side walks each path (recursing folders), keeps
// only video-extension files, dedupes, and sorts. Returns a flat path list.
export function expandDroppedPaths(paths: string[]): Promise<string[]> {
  return invoke<string[]>("expand_dropped_paths", { paths });
}

export type FileDropEvent =
  | { type: "enter"; paths: string[] }
  | { type: "leave" }
  | { type: "drop"; paths: string[] };

// Subscribe to the webview drag-drop event, flattened to a FileDropEvent (the
// `over` phase is ignored). No-op (NO_UNLISTEN) outside a Tauri host, so plain
// browser dev and jsdom tests don't crash - same guard as watchFullscreen.
export function watchFileDrop(
  handler: (event: FileDropEvent) => void,
): Promise<() => void> {
  try {
    return getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter") {
        handler({ type: "enter", paths: payload.paths });
        return;
      }
      if (payload.type === "leave") {
        handler({ type: "leave" });
        return;
      }
      if (payload.type === "drop") {
        handler({ type: "drop", paths: payload.paths });
      }
    });
  } catch {
    return Promise.resolve(NO_UNLISTEN);
  }
}

export async function toggleFullscreen(): Promise<void> {
  try {
    const appWindow = getCurrentWindow();
    const next = !(await appWindow.isFullscreen());
    await appWindow.setFullscreen(next);
  } catch {
    // no-op outside a Tauri host
  }
}
