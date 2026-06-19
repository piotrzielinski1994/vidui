import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { TransportBar } from "@/components/workspace/transport-bar";
import { Viewport } from "@/components/workspace/viewport";
import { Sidebar } from "@/components/workspace/sidebar";
import { fixtureVideos, singleVideoList } from "./fixtures";

const renderTransport = (initialActiveVideoId?: string) =>
  render(
    <WorkspaceProvider
      videos={fixtureVideos}
      initialActiveVideoId={initialActiveVideoId}
    >
      <TransportBar />
      <Viewport />
    </WorkspaceProvider>,
  );

const viewportName = () =>
  within(screen.getByRole("region", { name: /video viewport/i }));

describe("TransportBar", () => {
  // behavior: renders prev / play / next buttons + a single progressbar (AC-006)
  it("should render prev, play-pause and next controls plus a progressbar if mounted", () => {
    renderTransport("v-1");

    expect(
      screen.getByRole("button", { name: /previous/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  // behavior: time readout total equals the active video's formatted duration (AC-006)
  it("should show the active video's total duration in the time readout if a video is active", () => {
    renderTransport("v-1");

    // v-1 durationSec = 83 -> "01:23"; current value is lenient
    expect(
      screen.getByText(/^\d?\d:\d\d \/ 01:23$/),
    ).toBeInTheDocument();
  });

  // behavior: a different active video reads its own total (AC-006)
  it("should show 09:56 as the total if the active video is 596 seconds long", () => {
    renderTransport("v-21");

    expect(
      screen.getByText(/^\d?\d:\d\d \/ 09:56$/),
    ).toBeInTheDocument();
  });

  // behavior: empty readout when nothing is active (E-1)
  it("should read --:-- / --:-- if no video is active", () => {
    renderTransport();

    expect(screen.getByText("--:-- / --:--")).toBeInTheDocument();
  });

  // behavior: the play button toggles to a pause affordance and back (AC-007/TC-003)
  it("should switch the play button to pause and back if it is clicked twice", async () => {
    const user = userEvent.setup();
    renderTransport("v-1");

    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /pause/i }));
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  // behavior: next advances the active video to the next list entry (AC-008/TC-004)
  it("should advance the active video to the next entry if next is clicked", async () => {
    const user = userEvent.setup();
    renderTransport("v-1");

    expect(viewportName().getByText(/1 - Opening/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));

    // open order: next from "1 - Opening" is "21 - Finale"
    expect(viewportName().getByText(/21 - Finale/i)).toBeInTheDocument();
  });

  // behavior: next wraps from the last entry to the first (E-3)
  it("should wrap to the first entry if next is clicked on the last video", async () => {
    const user = userEvent.setup();
    renderTransport("v-12");

    await user.click(screen.getByRole("button", { name: /next/i }));

    // "12 - Bridge" is last in open order; wraps to first "1 - Opening"
    expect(viewportName().getByText(/1 - Opening/i)).toBeInTheDocument();
  });

  // behavior: prev wraps from the first entry to the last (E-3)
  it("should wrap to the last entry if prev is clicked on the first video", async () => {
    const user = userEvent.setup();
    renderTransport("v-1");

    await user.click(screen.getByRole("button", { name: /previous/i }));

    expect(viewportName().getByText(/12 - Bridge/i)).toBeInTheDocument();
  });

  // behavior: a single-video playlist keeps that video active on next (E-4)
  it("should keep the only video active if next is clicked with a single-video playlist", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={singleVideoList} initialActiveVideoId="solo">
        <TransportBar />
        <Viewport />
      </WorkspaceProvider>,
    );

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(viewportName().getByText(/5 - Lonely/i)).toBeInTheDocument();
  });

  // behavior: prev/next follow the CURRENT sorted order when a sort key is active (AC-008+AC-010)
  it("should step to the natural-next video if next is clicked with the title sort key active", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider
        videos={fixtureVideos}
        initialActiveVideoId="v-1"
        initialSortKeys={["title"]}
      >
        <Sidebar />
        <TransportBar />
        <Viewport />
      </WorkspaceProvider>,
    );

    await user.click(screen.getByRole("button", { name: /next/i }));

    // asc order is 1,3,9...; next from "1" is "3 - Intro" (NOT open-order "21")
    expect(viewportName().getByText(/3 - Intro/i)).toBeInTheDocument();
  });
});
