import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { VideoList } from "@/components/workspace/video-list";
import { Viewport } from "@/components/workspace/viewport";
import { fixtureVideos } from "./fixtures";

// Viewport pulls in the Tauri IPC boundary; mock the seam, not the components.
vi.mock("@/lib/tauri", () => ({
  logPlayback: vi.fn(() => Promise.resolve()),
  prepareMediaUrl: (path: string) =>
    Promise.resolve({ url: `asset://localhost${path}`, durationSec: null }),
  openVideoFiles: vi.fn(() => Promise.resolve([])),
}));

const renderList = (initialActiveVideoId?: string) =>
  render(
    <WorkspaceProvider
      videos={fixtureVideos}
      initialActiveVideoId={initialActiveVideoId}
    >
      <VideoList />
    </WorkspaceProvider>,
  );

const getList = () => screen.getByRole("list", { name: /playlist/i });

describe("VideoList", () => {
  // behavior: a flat list of all open videos renders as listitems (AC-003)
  it("should render every open video as a flat list item if mounted", () => {
    renderList();

    const items = within(getList()).getAllByRole("listitem");

    expect(items).toHaveLength(fixtureVideos.length);
    fixtureVideos.forEach((v) => {
      expect(
        within(getList()).getByRole("listitem", {
          name: new RegExp(v.name.replace(/[-]/g, "\\-"), "i"),
        }),
      ).toBeInTheDocument();
    });
  });

  // behavior: no folder/tree affordances - nothing carries aria-expanded (AC-003)
  it("should not render any expandable/folder affordance if the playlist is flat", () => {
    const { container } = renderList();

    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(screen.queryByRole("treeitem")).not.toBeInTheDocument();
  });

  // behavior: each row shows its format badge text (AC-009)
  it("should show the format text in each row if a video has a format", () => {
    renderList();

    fixtureVideos.forEach((v) => {
      const row = within(getList()).getByRole("listitem", {
        name: new RegExp(v.name.replace(/[-]/g, "\\-"), "i"),
      });
      expect(within(row).getByText(v.format)).toBeInTheDocument();
    });
  });

  // behavior: clicking a row flips aria-selected on it (AC-004/TC-002)
  it("should mark a row aria-selected if it is clicked", async () => {
    const user = userEvent.setup();
    renderList();

    const row = within(getList()).getByRole("listitem", {
      name: /3 - Intro/i,
    });
    expect(row).toHaveAttribute("aria-selected", "false");

    await user.click(row);

    expect(row).toHaveAttribute("aria-selected", "true");
  });

  // behavior: clicking a row activates it - the viewport reflects it (AC-004/TC-002)
  it("should make the clicked video active so the viewport shows it if a row is clicked", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos}>
        <VideoList />
        <Viewport />
      </WorkspaceProvider>,
    );

    const region = screen.getByRole("region", { name: /video viewport/i });
    expect(within(region).queryByText(/9 - Interlude/i)).not.toBeInTheDocument();

    await user.click(
      within(getList()).getByRole("listitem", { name: /9 - Interlude/i }),
    );

    expect(within(region).getByText(/9 - Interlude/i)).toBeInTheDocument();
  });
});
