import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { Workspace } from "@/components/workspace/workspace";
import { fixtureVideos } from "./fixtures";

// The workspace renders the Viewport, which reaches the Tauri IPC boundary;
// mock the seam (not the components) so the real <video> can mount under jsdom.
vi.mock("@/lib/tauri", () => ({
  prepareMediaUrl: (path: string) => Promise.resolve(`asset://localhost${path}`),
  openVideoFiles: vi.fn(() => Promise.resolve([])),
  toggleFullscreen: vi.fn(() => Promise.resolve()),
  watchFullscreen: vi.fn(() => Promise.resolve(() => {})),
  watchWindowFocus: vi.fn(() => Promise.resolve(() => {})),
  focusWebview: vi.fn(() => Promise.resolve()),
  expandDroppedPaths: vi.fn(() => Promise.resolve([])),
  watchFileDrop: vi.fn(() => Promise.resolve(() => {})),
}));

type RenderProps = Omit<
  React.ComponentProps<typeof WorkspaceProvider>,
  "children"
>;

const renderWorkspace = (props: RenderProps = { videos: fixtureVideos }) =>
  render(
    <HotkeysProvider>
      <WorkspaceProvider {...props}>
        <Workspace />
      </WorkspaceProvider>
    </HotkeysProvider>,
  );

const searchInput = () => screen.queryByPlaceholderText(/type a command/i);

const viewport = () =>
  within(screen.getByRole("region", { name: /video viewport/i }));

describe("Workspace command palette integration", () => {
  // behavior: Mod+K opens the palette while focus is in the workspace (AC-001 / TC-001)
  it("should open the palette if Mod+K is pressed in the workspace", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(searchInput()).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");

    await waitFor(() => expect(searchInput()).toBeInTheDocument());
  });

  // behavior: Escape closes an open palette (AC-002 / TC-001)
  it("should close the palette if Escape is pressed while it is open", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(searchInput()).toBeInTheDocument());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(searchInput()).not.toBeInTheDocument());
  });

  // behavior: the palette opener itself is not listed as a runnable row (AC-003 / TC-002)
  it("should not list the 'open command palette' action as a row if the palette is open", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(searchInput()).toBeInTheDocument());

    expect(
      screen.queryByRole("option", { name: /open command palette/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /play \/ pause/i }),
    ).toBeInTheDocument();
  });

  // side-effect-contract: selecting "Play / pause" toggles the playback affordance and closes (AC-005 / TC-004)
  it("should toggle playback and close the palette if 'Play / pause' is selected", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(searchInput()).toBeInTheDocument());

    await user.click(screen.getByRole("option", { name: /play \/ pause/i }));

    await waitFor(() => expect(searchInput()).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  // side-effect-contract: spacebar toggles play/pause without opening the palette (bug 3)
  it("should toggle play to pause if the spacebar is pressed in the workspace", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();

    await user.keyboard("[Space]");

    expect(searchInput()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /pause/i }),
      ).toBeInTheDocument(),
    );
  });

  // side-effect-contract: the next-video global hotkey advances the active video without opening the palette (AC-006 / TC-005)
  it("should advance the active video in sorted order if the next-video hotkey is pressed without the palette open", async () => {
    const user = userEvent.setup();
    renderWorkspace({
      videos: fixtureVideos,
      initialActiveVideoId: "v-1",
      initialSortKeys: ["title"],
    });

    // title-asc order is 1,3,9,12,21 -> next from "1 - Opening" is "3 - Intro"
    await user.keyboard("{Control>}{ArrowRight}{/Control}");

    expect(searchInput()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(viewport().getByText(/3 - Intro/i)).toBeInTheDocument(),
    );
  });

  // side-effect-contract: selecting "Toggle sidebar" hides the playlist and closes the palette (AC-005)
  it("should hide the sidebar and close the palette if 'Toggle sidebar' is selected", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(
      screen.getByRole("list", { name: /playlist/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(searchInput()).toBeInTheDocument());
    await user.click(screen.getByRole("option", { name: /toggle sidebar/i }));

    await waitFor(() => expect(searchInput()).not.toBeInTheDocument());
    expect(
      screen.queryByRole("list", { name: /playlist/i }),
    ).not.toBeInTheDocument();
    // viewport survives a hidden sidebar (B5)
    expect(
      screen.getByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();
  });

  // side-effect-contract: the toggle-sidebar global hotkey hides the playlist without opening the palette (AC-006)
  it("should hide the sidebar if the toggle-sidebar hotkey is pressed without the palette open", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(
      screen.getByRole("list", { name: /playlist/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Control>}b{/Control}");

    expect(searchInput()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: /playlist/i }),
      ).not.toBeInTheDocument(),
    );
  });

  // side-effect-contract: selecting "Toggle transport bar" hides the transport and closes the palette (AC-005)
  it("should hide the transport bar and close the palette if 'Toggle transport bar' is selected", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(
      screen.getByRole("button", { name: /previous/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(searchInput()).toBeInTheDocument());
    await user.click(
      screen.getByRole("option", { name: /toggle transport bar/i }),
    );

    await waitFor(() => expect(searchInput()).not.toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: /previous/i }),
    ).not.toBeInTheDocument();
    // viewport survives a hidden transport bar (B5)
    expect(
      screen.getByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();
  });

  // side-effect-contract: the toggle-transport global hotkey hides the transport without opening the palette (AC-006)
  it("should hide the transport bar if the toggle-transport hotkey is pressed without the palette open", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(
      screen.getByRole("button", { name: /previous/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Control>}j{/Control}");

    expect(searchInput()).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /previous/i }),
      ).not.toBeInTheDocument(),
    );
  });

  // side-effect-contract: running "Next video" with no active video is a safe no-op that still closes (AC-008 / TC-006)
  it("should not throw and should close if 'Next video' is run with no active video", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos });

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(searchInput()).toBeInTheDocument());

    await user.click(screen.getByRole("option", { name: /next video/i }));

    await waitFor(() => expect(searchInput()).not.toBeInTheDocument());
  });
});
