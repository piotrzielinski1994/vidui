import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { Viewport } from "@/components/workspace/viewport";
import { fixtureVideos } from "./fixtures";

describe("Viewport", () => {
  // behavior: active video renders inside an accessible region (AC-005)
  it("should expose an accessible video-viewport region if mounted", () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    expect(
      screen.getByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();
  });

  // behavior: active video shows its name + resolution (AC-005)
  it("should show the active video's name and resolution if a video is active", () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    const region = screen.getByRole("region", { name: /video viewport/i });
    expect(within(region).getByText(/3 - Intro/i)).toBeInTheDocument();
    expect(within(region).getByText(/720p/i)).toBeInTheDocument();
  });

  // behavior: empty state placeholder when nothing is active (AC-005/E-1)
  it("should render a no-video placeholder if no video is active", () => {
    render(
      <WorkspaceProvider videos={fixtureVideos}>
        <Viewport />
      </WorkspaceProvider>,
    );

    const region = screen.getByRole("region", { name: /video viewport/i });
    expect(within(region).getByText(/no video/i)).toBeInTheDocument();
  });
});
