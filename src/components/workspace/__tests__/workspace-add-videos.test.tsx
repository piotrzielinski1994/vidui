import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspace/workspace-context";
import type { VideoNode } from "@/components/workspace/mock-data";

const existing: VideoNode[] = [
  { id: "/v/a.mp4", name: "a.mp4", format: "MP4", path: "/v/a.mp4" },
];

const incoming: VideoNode[] = [
  { id: "/v/a.mp4", name: "a.mp4", format: "MP4", path: "/v/a.mp4" },
  { id: "/v/b.mkv", name: "b.mkv", format: "MKV", path: "/v/b.mkv" },
];

// Thin probe exposing context state as DOM, mirroring workspace-context.test.tsx.
// `addVideos` does not exist yet -> clicking the button calls undefined and the
// state assertions fail (RED) until the verb lands.
function Probe() {
  const ws = useWorkspace();
  return (
    <div>
      <ol aria-label="probe-playlist">
        {ws.playlist.map((v) => (
          <li key={v.id}>{v.name}</li>
        ))}
      </ol>
      <output aria-label="active-id">{ws.activeVideoId ?? "none"}</output>
      <output aria-label="playing">{String(ws.isPlaying)}</output>
      <button onClick={() => ws.addVideos(incoming)}>do-add</button>
    </div>
  );
}

const playlistNames = () =>
  within(screen.getByRole("list", { name: "probe-playlist" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

const renderProbe = (
  props: Omit<React.ComponentProps<typeof WorkspaceProvider>, "children">,
) =>
  render(
    <WorkspaceProvider {...props}>
      <Probe />
    </WorkspaceProvider>,
  );

describe("workspace addVideos", () => {
  // behavior: appends new videos, deduping by id against existing rows (AC-001/AC-006 / E-3)
  it("should append the new videos and dedupe by id if addVideos is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: existing, initialActiveVideoId: "/v/a.mp4" });

    await user.click(screen.getByRole("button", { name: "do-add" }));

    expect(playlistNames()).toEqual(["a.mp4", "b.mkv"]);
  });

  // behavior: activates+plays the first newly-added video only when nothing is active (AC-004 / E-5)
  it("should activate and play the first new video if nothing is active", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: [] });

    expect(screen.getByLabelText("active-id")).toHaveTextContent("none");

    await user.click(screen.getByRole("button", { name: "do-add" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("/v/a.mp4");
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // behavior: leaves an already-active video untouched (AC-005 / E-5)
  it("should leave the active video unchanged if a video is already active", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: existing, initialActiveVideoId: "/v/a.mp4" });

    await user.click(screen.getByRole("button", { name: "do-add" }));

    expect(playlistNames()).toEqual(["a.mp4", "b.mkv"]);
    expect(screen.getByLabelText("active-id")).toHaveTextContent("/v/a.mp4");
  });
});
