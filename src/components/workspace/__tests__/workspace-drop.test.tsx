import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { Workspace } from "@/components/workspace/workspace";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { createInMemorySettingsStore } from "@/lib/settings/in-memory-store";
import type { VideoNode } from "@/components/workspace/mock-data";

// The Tauri IPC boundary is the single mockable seam. We mock only this module;
// the Workspace, context, viewport, DropOverlay and transport are the real SUT.
// `watchFileDrop` captures the handler so the test can fire enter/leave/drop at
// it; `expandDroppedPaths` is a programmable resolver.
type FileDropEvent =
  | { type: "enter"; paths: string[] }
  | { type: "leave" }
  | { type: "drop"; paths: string[] };

let dropHandler: ((event: FileDropEvent) => void) | null = null;
const expandDroppedPaths = vi.fn<(paths: string[]) => Promise<string[]>>();
const watchFileDrop = vi.fn((handler: (event: FileDropEvent) => void) => {
  dropHandler = handler;
  return Promise.resolve(() => {
    dropHandler = null;
  });
});

vi.mock("@/lib/tauri", () => ({
  logPlayback: vi.fn(() => Promise.resolve()),
  openVideoFiles: vi.fn(() => Promise.resolve([])),
  prepareMediaUrl: (path: string) =>
    Promise.resolve({ url: `asset://localhost${path}`, durationSec: null }),
  toggleFullscreen: vi.fn(() => Promise.resolve()),
  watchFullscreen: vi.fn(() => Promise.resolve(() => {})),
  watchWindowFocus: vi.fn(() => Promise.resolve(() => {})),
  focusWebview: vi.fn(() => Promise.resolve()),
  expandDroppedPaths: (paths: string[]) => expandDroppedPaths(paths),
  watchFileDrop: (handler: (event: FileDropEvent) => void) =>
    watchFileDrop(handler),
}));

const startVideos: VideoNode[] = [
  { id: "/v/x.mp4", name: "x.mp4", format: "MP4", path: "/v/x.mp4" },
];

const renderWorkspace = (videos: VideoNode[] = []) =>
  render(
    <HotkeysProvider>
      <SettingsProvider store={createInMemorySettingsStore()}>
        <WorkspaceProvider videos={videos} initialActiveVideoId={videos[0]?.id}>
          <Workspace />
        </WorkspaceProvider>
      </SettingsProvider>
    </HotkeysProvider>,
  );

const viewport = () =>
  within(screen.getByRole("region", { name: /video viewport/i }));

const playlist = () => screen.getByRole("list", { name: /playlist/i });

const rows = () => within(playlist()).queryAllByRole("listitem");

const overlay = () => screen.queryByText(/drop to add/i);

// Fire a captured drag-drop event and flush the async expand->addVideos chain.
// The Workspace must subscribe via watchFileDrop on mount (the wiring contract);
// that is what captures `dropHandler`.
const fireDrop = async (event: FileDropEvent) => {
  await waitFor(() => expect(watchFileDrop).toHaveBeenCalled());
  await act(async () => {
    dropHandler?.(event);
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  dropHandler = null;
});

describe("Workspace drag-drop import", () => {
  // behavior: dropping onto an empty playlist appends rows; first becomes active+playing (AC-001/AC-004 / TC-001)
  it("should append rows and activate-and-play the first if dropped onto an empty playlist", async () => {
    expandDroppedPaths.mockResolvedValue(["/v/a.mp4", "/v/b.mkv"]);
    renderWorkspace([]);

    await fireDrop({ type: "drop", paths: ["/v/a.mp4", "/v/b.mkv"] });

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(
      within(playlist()).getByRole("listitem", { name: /a\.mp4/i }),
    ).toBeInTheDocument();
    expect(
      within(playlist()).getByRole("listitem", { name: /b\.mkv/i }),
    ).toBeInTheDocument();
    expect(viewport().getByText(/a\.mp4/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  // behavior: dropping onto a playing playlist appends after, active+playback untouched (AC-005/AC-001 / TC-002)
  it("should append after existing rows and leave the active video playing if dropped while one is active", async () => {
    const user = userEvent.setup();
    expandDroppedPaths.mockResolvedValue(["/v/y.mp4"]);
    renderWorkspace(startVideos);

    // Start playback (the provider boots paused) so "still playing" is a real
    // precondition the drop must not disturb.
    await screen.findByRole("list", { name: /playlist/i });
    await user.click(
      within(playlist()).getByRole("listitem", { name: /x\.mp4/i }),
    );
    expect(viewport().getByText(/x\.mp4/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();

    await fireDrop({ type: "drop", paths: ["/v/y.mp4"] });

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().map((li) => li.getAttribute("aria-label"))).toEqual([
      "x.mp4",
      "y.mp4",
    ]);
    expect(viewport().getByText(/x\.mp4/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  // behavior: a path already in the playlist is not doubled (AC-006 / TC-005)
  it("should not double a path that is already in the playlist if it is re-dropped", async () => {
    expandDroppedPaths.mockResolvedValue(["/v/x.mp4", "/v/b.mkv"]);
    renderWorkspace(startVideos);

    await fireDrop({ type: "drop", paths: ["/v/x.mp4", "/v/b.mkv"] });

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().map((li) => li.getAttribute("aria-label"))).toEqual([
      "x.mp4",
      "b.mkv",
    ]);
  });

  // behavior: a drop expanding to zero videos is a no-op; overlay cleared (AC-008 / TC-004/TC-007)
  it("should leave the playlist and active video untouched and clear the overlay if the drop expands to nothing", async () => {
    expandDroppedPaths.mockResolvedValue([]);
    renderWorkspace(startVideos);

    await fireDrop({ type: "enter", paths: ["/v/doc.pdf"] });
    expect(overlay()).toBeInTheDocument();

    await fireDrop({ type: "drop", paths: ["/v/doc.pdf"] });

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("aria-label", "x.mp4");
    expect(viewport().getByText(/x\.mp4/i)).toBeInTheDocument();
    expect(overlay()).not.toBeInTheDocument();
  });

  // behavior: drag-enter shows the overlay, drag-leave hides it (AC-007 / TC-006)
  it("should show the overlay on drag-enter and hide it on drag-leave", async () => {
    renderWorkspace(startVideos);

    expect(overlay()).not.toBeInTheDocument();

    await fireDrop({ type: "enter", paths: ["/v/a.mp4"] });
    expect(overlay()).toBeInTheDocument();

    await fireDrop({ type: "leave" });
    expect(overlay()).not.toBeInTheDocument();
  });

  // behavior: a drop hides the overlay even when videos are imported (AC-007 / TC-006)
  it("should hide the overlay after a drop", async () => {
    expandDroppedPaths.mockResolvedValue(["/v/a.mp4"]);
    renderWorkspace([]);

    await fireDrop({ type: "enter", paths: ["/v/a.mp4"] });
    expect(overlay()).toBeInTheDocument();

    await fireDrop({ type: "drop", paths: ["/v/a.mp4"] });

    expect(overlay()).not.toBeInTheDocument();
  });

  // side-effect-contract: the drop path delegates the raw paths to expandDroppedPaths (AC-002/AC-003)
  it("should call expandDroppedPaths with the dropped paths if a drop occurs", async () => {
    expandDroppedPaths.mockResolvedValue([]);
    renderWorkspace([]);

    await fireDrop({ type: "drop", paths: ["/v/folder", "/v/a.mp4"] });

    expect(expandDroppedPaths).toHaveBeenCalledWith(["/v/folder", "/v/a.mp4"]);
  });
});
