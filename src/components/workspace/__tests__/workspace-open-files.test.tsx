import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { Workspace } from "@/components/workspace/workspace";

// The Tauri IPC boundary is the single mockable seam. We mock only this module;
// the Workspace, context, viewport and transport are the real SUT.
const openVideoFiles = vi.fn();

vi.mock("@/lib/tauri", () => ({
  openVideoFiles: () => openVideoFiles(),
  prepareMediaUrl: (path: string) => Promise.resolve(`asset://localhost${path}`),
  toggleFullscreen: vi.fn(() => Promise.resolve()),
  watchFullscreen: vi.fn(() => Promise.resolve(() => {})),
  watchWindowFocus: vi.fn(() => Promise.resolve(() => {})),
  focusWebview: vi.fn(() => Promise.resolve()),
  expandDroppedPaths: vi.fn(() => Promise.resolve([])),
  watchFileDrop: vi.fn(() => Promise.resolve(() => {})),
}));

const renderWorkspace = () =>
  render(
    <HotkeysProvider>
      <WorkspaceProvider videos={[]}>
        <Workspace />
      </WorkspaceProvider>
    </HotkeysProvider>,
  );

const searchInput = () => screen.queryByPlaceholderText(/type a command/i);

const viewport = () =>
  within(screen.getByRole("region", { name: /video viewport/i }));

const playlist = () => screen.queryByRole("list", { name: /playlist/i });

const openPaletteAndRunOpenFiles = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  await user.keyboard("{Control>}k{/Control}");
  await waitFor(() => expect(searchInput()).toBeInTheDocument());
  await user.click(screen.getByRole("option", { name: /open files/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Workspace open-files flow", () => {
  // behavior: the open-files command appears as a palette row (AC-001)
  it("should list an 'Open files' command in the palette if it is open", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(searchInput()).toBeInTheDocument());

    expect(
      screen.getByRole("option", { name: /open files/i }),
    ).toBeInTheDocument();
  });

  // side-effect-contract: running open-files calls the IPC picker exactly once (AC-001)
  it("should call openVideoFiles once if the open-files command is run", async () => {
    const user = userEvent.setup();
    openVideoFiles.mockResolvedValue([]);
    renderWorkspace();

    await openPaletteAndRunOpenFiles(user);

    await waitFor(() => expect(openVideoFiles).toHaveBeenCalledTimes(1));
  });

  // behavior: chosen files replace the (empty) playlist with one row each (AC-002 / TC-001)
  it("should replace the playlist with the chosen files if files are returned", async () => {
    const user = userEvent.setup();
    openVideoFiles.mockResolvedValue([
      "/videos/Alpha.mp4",
      "/videos/Bravo.mkv",
    ]);
    renderWorkspace();

    await openPaletteAndRunOpenFiles(user);

    await waitFor(() =>
      expect(within(playlist() as HTMLElement).getAllByRole("listitem")).toHaveLength(2),
    );
    expect(
      within(playlist() as HTMLElement).getByRole("listitem", {
        name: /Alpha\.mp4/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(playlist() as HTMLElement).getByRole("listitem", {
        name: /Bravo\.mkv/i,
      }),
    ).toBeInTheDocument();
  });

  // behavior: the first chosen file becomes active in the viewport and plays (AC-002/AC-004/AC-005 / TC-001)
  it("should activate and play the first chosen file if files are returned", async () => {
    const user = userEvent.setup();
    openVideoFiles.mockResolvedValue([
      "/videos/Alpha.mp4",
      "/videos/Bravo.mkv",
    ]);
    renderWorkspace();

    await openPaletteAndRunOpenFiles(user);

    await waitFor(() =>
      expect(viewport().getByText(/Alpha\.mp4/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  // behavior: cancelling the picker (empty result) leaves the playlist empty and shows the placeholder (AC-003 / E-1 / TC-002)
  it("should leave the playlist empty and keep the placeholder if the picker returns nothing", async () => {
    const user = userEvent.setup();
    openVideoFiles.mockResolvedValue([]);
    renderWorkspace();

    await openPaletteAndRunOpenFiles(user);

    await waitFor(() => expect(openVideoFiles).toHaveBeenCalledTimes(1));
    expect(
      within(playlist() as HTMLElement).queryAllByRole("listitem"),
    ).toHaveLength(0);
    expect(viewport().getByText(/no video/i)).toBeInTheDocument();
  });

  // behavior: an already-playing playlist is untouched when the picker is cancelled (AC-003 / TC-002)
  it("should leave an existing active video unchanged if the picker is cancelled", async () => {
    const user = userEvent.setup();
    openVideoFiles
      .mockResolvedValueOnce(["/videos/First.mp4", "/videos/Second.mkv"])
      .mockResolvedValueOnce([]);
    renderWorkspace();

    await openPaletteAndRunOpenFiles(user);
    await waitFor(() =>
      expect(viewport().getByText(/First\.mp4/i)).toBeInTheDocument(),
    );

    await openPaletteAndRunOpenFiles(user);

    await waitFor(() => expect(openVideoFiles).toHaveBeenCalledTimes(2));
    expect(viewport().getByText(/First\.mp4/i)).toBeInTheDocument();
    expect(
      within(playlist() as HTMLElement).getAllByRole("listitem"),
    ).toHaveLength(2);
  });
});
