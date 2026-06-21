import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspace/workspace-context";
import { TransportBar } from "@/components/workspace/transport-bar";
import { Viewport } from "@/components/workspace/viewport";
import { Workspace } from "@/components/workspace/workspace";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { createInMemorySettingsStore } from "@/lib/settings/in-memory-store";
import { SHORTCUT_ACTIONS } from "@/lib/shortcuts/registry";
import { fixtureVideos } from "./fixtures";

// The viewport reaches the Tauri IPC boundary; mock that seam (not the
// components) so the real <video> can mount and be driven under jsdom.
vi.mock("@/lib/tauri", () => ({
  logPlayback: vi.fn(() => Promise.resolve()),
  prepareMediaUrl: (path: string) =>
    Promise.resolve({ url: `asset://localhost${path}`, durationSec: null }),
  openVideoFiles: vi.fn(() => Promise.resolve([])),
  toggleFullscreen: vi.fn(() => Promise.resolve()),
  watchFullscreen: vi.fn(() => Promise.resolve(() => {})),
  watchWindowFocus: vi.fn(() => Promise.resolve(() => {})),
  focusWebview: vi.fn(() => Promise.resolve()),
  expandDroppedPaths: vi.fn(() => Promise.resolve([])),
  watchFileDrop: vi.fn(() => Promise.resolve(() => {})),
}));

// A probe that reports live playback figures (so stepFrame has a duration to
// clamp against, like the real timeupdate/loadedmetadata handlers) AND exposes
// the new stepFrame verb + observable state as DOM.
function Probe({
  current = 30,
  duration = 60,
}: {
  current?: number;
  duration?: number;
}) {
  const {
    reportProgress,
    togglePlay,
    seekToSec,
    playbackCurrentSec,
    isPlaying,
    activeVideoId,
    stepFrame,
  } = useWorkspace();
  return (
    <div>
      <button onClick={() => reportProgress(current, duration)}>
        report-progress
      </button>
      <button onClick={() => togglePlay()}>do-toggle-play</button>
      <output aria-label="seek-target">{String(seekToSec)}</output>
      <output aria-label="current-sec">{String(playbackCurrentSec)}</output>
      <output aria-label="playing">{String(isPlaying)}</output>
      <output aria-label="active-id">{String(activeVideoId)}</output>
      <output aria-label="step-frame-type">{typeof stepFrame}</output>
      <button onClick={() => stepFrame(1)}>step-forward</button>
      <button onClick={() => stepFrame(-1)}>step-back</button>
    </div>
  );
}

const findVideo = async () => {
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  return document.querySelector("video") as HTMLVideoElement;
};

const renderProbe = (
  initialActiveVideoId?: string,
  progress?: { current?: number; duration?: number },
) =>
  render(
    <WorkspaceProvider
      videos={fixtureVideos}
      initialActiveVideoId={initialActiveVideoId}
    >
      <TransportBar />
      <Viewport />
      <Probe {...progress} />
    </WorkspaceProvider>,
  );

const renderWorkspace = (
  props: Omit<
    React.ComponentProps<typeof WorkspaceProvider>,
    "children"
  > = { videos: fixtureVideos },
) =>
  render(
    <HotkeysProvider>
      <SettingsProvider store={createInMemorySettingsStore()}>
        <WorkspaceProvider {...props}>
          <Workspace />
        </WorkspaceProvider>
      </SettingsProvider>
    </HotkeysProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("frame-step: registry (AC-001)", () => {
  // behavior: the two frame-step actions are registered with the comma/period bindings (AC-001 / TC-009)
  it("should register frame-step-forward bound to '.' and frame-step-back bound to ',' if read", () => {
    const forward = SHORTCUT_ACTIONS.find((a) => a.id === "frame-step-forward");
    const back = SHORTCUT_ACTIONS.find((a) => a.id === "frame-step-back");

    expect(forward?.defaultHotkey).toBe(".");
    expect(back?.defaultHotkey).toBe(",");
  });

  // behavior: both frame-step actions carry a non-empty name + description (AC-001 / TC-009)
  it("should give both frame-step actions a non-empty name and description if read", () => {
    const forward = SHORTCUT_ACTIONS.find((a) => a.id === "frame-step-forward");
    const back = SHORTCUT_ACTIONS.find((a) => a.id === "frame-step-back");

    expect(forward?.name.trim().length).toBeGreaterThan(0);
    expect(forward?.description.trim().length).toBeGreaterThan(0);
    expect(back?.name.trim().length).toBeGreaterThan(0);
    expect(back?.description.trim().length).toBeGreaterThan(0);
  });
});

describe("frame-step: stepFrame verb (AC-002)", () => {
  // side-effect-contract: stepFrame forward moves the playhead by +1/30s and requests that seek (AC-002 / TC-001)
  it("should move the playhead to current+1/30 if stepFrame forward is called", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-forward" }));

    const target = Number(
      screen.getByLabelText("seek-target").textContent,
    );
    const currentSec = Number(
      screen.getByLabelText("current-sec").textContent,
    );
    expect(target).toBeCloseTo(30.0333, 3);
    expect(currentSec).toBeCloseTo(30.0333, 3);
  });

  // side-effect-contract: stepFrame back moves the playhead by -1/30s and requests that seek (AC-002 / TC-002)
  it("should move the playhead to current-1/30 if stepFrame back is called", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-back" }));

    const target = Number(
      screen.getByLabelText("seek-target").textContent,
    );
    expect(target).toBeCloseTo(29.9667, 3);
  });

  // side-effect-contract: the <video> element's currentTime follows the forward step (AC-002 / AC-007 / TC-001)
  it("should drive the video element currentTime forward by 1/30 if stepFrame forward is called", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-forward" }));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(30.0333, 3));
  });

  // side-effect-contract: the <video> element's currentTime follows the back step (AC-002 / AC-007 / TC-002)
  it("should drive the video element currentTime back by 1/30 if stepFrame back is called", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-back" }));

    await waitFor(() => expect(video.currentTime).toBeCloseTo(29.9667, 3));
  });
});

describe("frame-step: clamping (AC-004)", () => {
  // side-effect-contract: stepping back near 0 lower-clamps to 0 (AC-004 / TC-005)
  it("should clamp the playhead to 0 if stepFrame back would go below 0", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 0.01, duration: 60 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-back" }));

    expect(screen.getByLabelText("seek-target")).toHaveTextContent("0");
  });

  // side-effect-contract: stepping forward near the end upper-clamps to the duration (AC-004 / TC-006)
  it("should clamp the playhead to the duration if stepFrame forward would exceed it", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 59.99, duration: 60 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-forward" }));

    expect(screen.getByLabelText("seek-target")).toHaveTextContent("60");
  });

  // side-effect-contract: with an unknown duration (0) stepping forward lower-clamps only, no upper cap (AC-004 / TC-007)
  it("should step forward and lower-clamp only if the duration is unknown", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 10, duration: 0 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-forward" }));

    const target = Number(
      screen.getByLabelText("seek-target").textContent,
    );
    expect(target).toBeCloseTo(10.0333, 3);
  });
});

describe("frame-step: pause semantics (AC-003)", () => {
  // side-effect-contract: stepping while playing pauses playback and the element stays paused (AC-003 / TC-003)
  it("should pause playback if stepFrame is called while playing", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "do-toggle-play" }));
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");

    await user.click(screen.getByRole("button", { name: "step-forward" }));

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
    await waitFor(() => expect(video.paused).toBe(true));
  });

  // behavior: stepping while already paused leaves playback paused (AC-003 / TC-004)
  it("should keep playback paused if stepFrame is called while already paused", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "step-forward" }));

    // The step must actually have run (proven by the moved playhead), and it
    // must have left playback paused - not merely thrown leaving the default.
    const target = Number(screen.getByLabelText("seek-target").textContent);
    expect(target).toBeCloseTo(30.0333, 3);
    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
  });
});

describe("frame-step: no active video (AC-005)", () => {
  // behavior: both frame-step verbs are a safe no-op when nothing is active (AC-005 / TC-008)
  it("should not throw and should leave playhead/isPlaying untouched if stepFrame runs with no active video", async () => {
    const user = userEvent.setup();
    renderProbe(undefined, { current: 0, duration: 0 });

    // The verb must EXIST on the context (so this asserts the no-op contract,
    // not merely the unchanged default a missing/throwing verb would also leave).
    expect(screen.getByLabelText("step-frame-type")).toHaveTextContent(
      "function",
    );

    await user.click(screen.getByRole("button", { name: "step-forward" }));
    await user.click(screen.getByRole("button", { name: "step-back" }));

    expect(screen.getByLabelText("current-sec")).toHaveTextContent("0");
    expect(screen.getByLabelText("seek-target")).toHaveTextContent("null");
    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
  });
});

describe("frame-step: palette parity (AC-006)", () => {
  // behavior: both frame-step actions appear as palette command rows (AC-006 / TC-010)
  it("should list a palette command for both frame-step actions if the palette is open", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/type a command/i),
      ).toBeInTheDocument(),
    );

    const names = ["frame-step-forward", "frame-step-back"].map((id) => {
      const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
      expect(action).toBeDefined();
      return action!.name;
    });

    names.forEach((name) => {
      expect(
        screen.getByRole("option", { name: new RegExp(name, "i") }),
      ).toBeInTheDocument();
    });
  });
});

describe("frame-step: hotkeys drive the element (AC-007)", () => {
  // side-effect-contract: '.' steps the active element forward one frame via the global hotkey (AC-007 / TC-011)
  it("should step the element currentTime forward by 1/30 if '.' is pressed in the workspace", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    const video = await findVideo();
    video.dispatchEvent(new Event("loadedmetadata"));
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 60,
    });
    video.currentTime = 30;
    video.dispatchEvent(new Event("timeupdate"));

    await user.keyboard(".");

    await waitFor(() => expect(video.currentTime).toBeCloseTo(30.0333, 3));
  });

  // side-effect-contract: ',' steps the active element back one frame via the global hotkey (AC-007 / TC-012)
  it("should step the element currentTime back by 1/30 if ',' is pressed in the workspace", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    const video = await findVideo();
    video.dispatchEvent(new Event("loadedmetadata"));
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 60,
    });
    video.currentTime = 30;
    video.dispatchEvent(new Event("timeupdate"));

    await user.keyboard(",");

    await waitFor(() => expect(video.currentTime).toBeCloseTo(29.9667, 3));
  });
});
