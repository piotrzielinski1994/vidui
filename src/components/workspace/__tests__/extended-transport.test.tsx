import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

// A probe that both reports live playback figures (so seekBy has a duration to
// clamp against, like the real timeupdate/loadedmetadata handlers) AND exposes
// the new context state + verbs as observable DOM.
function Probe({
  current = 30,
  duration = 60,
}: {
  current?: number;
  duration?: number;
}) {
  const {
    reportProgress,
    seekToSec,
    playbackCurrentSec,
    seekBy,
    volume,
    isMuted,
    setVolume,
    changeVolume,
    toggleMute,
    playbackRate,
    changeRate,
    nextVideo,
    activeVideoId,
  } = useWorkspace();
  return (
    <div>
      <button onClick={() => reportProgress(current, duration)}>
        report-progress
      </button>
      <output aria-label="seek-target">{String(seekToSec)}</output>
      <output aria-label="current-sec">{String(playbackCurrentSec)}</output>
      <output aria-label="active-id">{String(activeVideoId)}</output>
      <output aria-label="volume">{String(volume)}</output>
      <output aria-label="muted">{String(isMuted)}</output>
      <output aria-label="rate">{String(playbackRate)}</output>
      <button onClick={() => nextVideo()}>do-next</button>
      <button onClick={() => seekBy(5)}>seek-by-plus-5</button>
      <button onClick={() => seekBy(-5)}>seek-by-minus-5</button>
      <button onClick={() => seekBy(-1)}>seek-by-minus-1</button>
      <button onClick={() => changeVolume(-0.05)}>vol-down</button>
      <button onClick={() => changeVolume(0.05)}>vol-up</button>
      <button onClick={() => setVolume(0.5)}>set-vol-half</button>
      <button onClick={() => setVolume(2)}>set-vol-over</button>
      <button onClick={() => changeVolume(-2)}>vol-floor</button>
      <button onClick={() => toggleMute()}>do-mute</button>
      <button onClick={() => changeRate(0.1)}>rate-up</button>
      <button onClick={() => changeRate(-0.1)}>rate-down</button>
    </div>
  );
}

const viewportName = () =>
  within(screen.getByRole("region", { name: /video viewport/i }));

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

describe("extended transport: seek registry (AC-001)", () => {
  // behavior: the four relative-seek actions are registered with their bindings (AC-001)
  it("should register seek-forward and seek-back with the arrow bindings if read", () => {
    const forward = SHORTCUT_ACTIONS.find((a) => a.id === "seek-forward");
    const back = SHORTCUT_ACTIONS.find((a) => a.id === "seek-back");

    expect(forward?.defaultHotkey).toBe("ArrowRight");
    expect(back?.defaultHotkey).toBe("ArrowLeft");
  });

  // behavior: the fine-seek variants are bound to Shift+Arrow (AC-001)
  it("should register the fine seek variants bound to Shift+Arrow if read", () => {
    const forwardFine = SHORTCUT_ACTIONS.find(
      (a) => a.id === "seek-forward-fine",
    );
    const backFine = SHORTCUT_ACTIONS.find((a) => a.id === "seek-back-fine");

    expect(forwardFine?.defaultHotkey).toBe("Shift+ArrowRight");
    expect(backFine?.defaultHotkey).toBe("Shift+ArrowLeft");
  });
});

describe("extended transport: seekBy (AC-002)", () => {
  // side-effect-contract: seekBy adds the delta to current and requests that seek (AC-002 / TC-001)
  it("should move the playhead to current+delta if seekBy is called", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "seek-by-plus-5" }));

    expect(screen.getByLabelText("seek-target")).toHaveTextContent("35");
    expect(screen.getByLabelText("current-sec")).toHaveTextContent("35");
  });

  // side-effect-contract: seekBy lower-clamps to 0 rather than going negative (AC-002 / TC-002 / E-3)
  it("should clamp the playhead to 0 if seekBy would go below 0", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 0.5, duration: 60 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "seek-by-minus-1" }));

    expect(screen.getByLabelText("seek-target")).toHaveTextContent("0");
  });

  // side-effect-contract: seekBy upper-clamps to the duration rather than overshooting (AC-002 / TC-003 / E-3)
  it("should clamp the playhead to the duration if seekBy would exceed it", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 59, duration: 60 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "seek-by-plus-5" }));

    expect(screen.getByLabelText("seek-target")).toHaveTextContent("60");
  });

  // side-effect-contract: the <video> element's currentTime follows the seek target (AC-002)
  it("should drive the video element currentTime if seekBy is called", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 30, duration: 60 });

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "seek-by-plus-5" }));

    await waitFor(() => expect(video.currentTime).toBe(35));
  });
});

describe("extended transport: volume registry + changeVolume (AC-003)", () => {
  // behavior: the volume actions are registered with the up/down arrow bindings (AC-003)
  it("should register volume-up and volume-down with the vertical arrow bindings if read", () => {
    const up = SHORTCUT_ACTIONS.find((a) => a.id === "volume-up");
    const down = SHORTCUT_ACTIONS.find((a) => a.id === "volume-down");

    expect(up?.defaultHotkey).toBe("ArrowUp");
    expect(down?.defaultHotkey).toBe("ArrowDown");
  });

  // behavior: volume defaults to 1 and the element starts unmuted at full volume (AC-003)
  it("should default volume to 1 on the element if a video is active", async () => {
    renderProbe("v-1");

    const video = await findVideo();
    await waitFor(() => expect(video.volume).toBe(1));
    expect(screen.getByLabelText("volume")).toHaveTextContent("1");
  });

  // side-effect-contract: changeVolume nudges the volume and the element reflects it (AC-003 / TC-004)
  it("should lower the element volume to 0.9 if changeVolume(-0.05) is called twice", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "vol-down" }));
    await user.click(screen.getByRole("button", { name: "vol-down" }));

    expect(screen.getByLabelText("volume")).toHaveTextContent("0.9");
    await waitFor(() => expect(video.volume).toBeCloseTo(0.9));
  });

  // side-effect-contract: changeVolume lower-clamps to 0 (AC-003 / E-5)
  it("should clamp the volume to 0 if changeVolume drops below 0", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "vol-floor" }));

    expect(screen.getByLabelText("volume")).toHaveTextContent("0");
    await waitFor(() => expect(video.volume).toBe(0));
  });

  // side-effect-contract: setVolume upper-clamps to 1 (AC-003 / E-5)
  it("should clamp the volume to 1 if setVolume is given a value above 1", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "set-vol-over" }));

    expect(screen.getByLabelText("volume")).toHaveTextContent("1");
    await waitFor(() => expect(video.volume).toBe(1));
  });
});

describe("extended transport: volume slider (AC-004)", () => {
  // behavior: the volume slider exposes the documented aria contract at default volume (AC-004)
  it("should expose a Volume slider with min 0, max 100 and valuenow 100 if mounted at full volume", () => {
    renderProbe("v-1");

    const slider = screen.getByRole("slider", { name: /volume/i });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(slider).toHaveAttribute("aria-valuenow", "100");
  });

  // behavior: aria-valuenow is round(volume*100) after a hotkey-style nudge (AC-004 / TC-004)
  it("should set the slider aria-valuenow to 90 if volume drops to 0.9", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await user.click(screen.getByRole("button", { name: "vol-down" }));
    await user.click(screen.getByRole("button", { name: "vol-down" }));

    expect(screen.getByRole("slider", { name: /volume/i })).toHaveAttribute(
      "aria-valuenow",
      "90",
    );
  });

  // side-effect-contract: clicking the slider mid-point sets volume to 0.5 + drives the element (AC-004 / TC-005)
  it("should set volume to 0.5 if the volume slider is clicked at its mid-point", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    const slider = screen.getByRole("slider", { name: /volume/i });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      bottom: 0,
      right: 100,
      height: 4,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await user.pointer({ target: slider, coords: { clientX: 50, clientY: 0 } });
    await user.pointer({
      keys: "[MouseLeft]",
      target: slider,
      coords: { clientX: 50, clientY: 0 },
    });

    expect(screen.getByRole("slider", { name: /volume/i })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    await waitFor(() => expect(video.volume).toBeCloseTo(0.5));
  });
});

describe("extended transport: mute (AC-005)", () => {
  // behavior: the mute action is registered and bound to M (AC-005)
  it("should register toggle-mute bound to M if read", () => {
    const mute = SHORTCUT_ACTIONS.find((a) => a.id === "toggle-mute");

    expect(mute?.defaultHotkey).toBe("M");
  });

  // behavior: the transport bar shows a Mute button when unmuted (AC-005)
  it("should label the mute button 'Mute' if the video is not muted", () => {
    renderProbe("v-1");

    expect(screen.getByRole("button", { name: /^mute$/i })).toBeInTheDocument();
  });

  // side-effect-contract: clicking the mute button mutes the element + relabels to Unmute (AC-005 / TC-006)
  it("should mute the element and relabel the button to 'Unmute' if the mute button is clicked", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: /^mute$/i }));

    expect(screen.getByLabelText("muted")).toHaveTextContent("true");
    expect(
      screen.getByRole("button", { name: /unmute/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(video.muted).toBe(true));
  });

  // side-effect-contract: toggling mute twice unmutes the element again (AC-005 / TC-006)
  it("should unmute the element if the mute button is clicked twice", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: /^mute$/i }));
    await user.click(screen.getByRole("button", { name: /unmute/i }));

    expect(screen.getByLabelText("muted")).toHaveTextContent("false");
    await waitFor(() => expect(video.muted).toBe(false));
  });

  // side-effect-contract: mute is independent of volume - muting leaves volume untouched (E-7)
  it("should leave the volume unchanged if the element is muted", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "do-mute" }));

    expect(screen.getByLabelText("muted")).toHaveTextContent("true");
    expect(screen.getByLabelText("volume")).toHaveTextContent("1");
    await waitFor(() => {
      expect(video.muted).toBe(true);
      expect(video.volume).toBe(1);
    });
  });
});

describe("extended transport: speed registry + changeRate + readout (AC-006)", () => {
  // behavior: the speed actions are registered with the bracket bindings (AC-006)
  it("should register speed-up bound to ] and speed-down bound to [ if read", () => {
    const up = SHORTCUT_ACTIONS.find((a) => a.id === "speed-up");
    const down = SHORTCUT_ACTIONS.find((a) => a.id === "speed-down");

    expect(up?.defaultHotkey).toBe("]");
    expect(down?.defaultHotkey).toBe("[");
  });

  // side-effect-contract: five +0.1 steps reach 1.5x on the element (AC-006 / TC-007)
  it("should step the element playbackRate to 1.5 if changeRate(0.1) is called five times", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    const rateUp = screen.getByRole("button", { name: "rate-up" });
    for (let i = 0; i < 5; i += 1) {
      await user.click(rateUp);
    }

    expect(screen.getByLabelText("rate")).toHaveTextContent("1.5");
    await waitFor(() => expect(video.playbackRate).toBeCloseTo(1.5));
  });

  // side-effect-contract: stepping up past 2.0 clamps at 2.0 (AC-006 / TC-007 / E-6)
  it("should clamp the playbackRate to 2 if changeRate steps past the upper bound", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    const rateUp = screen.getByRole("button", { name: "rate-up" });
    for (let i = 0; i < 20; i += 1) {
      await user.click(rateUp);
    }

    expect(screen.getByLabelText("rate")).toHaveTextContent("2");
    await waitFor(() => expect(video.playbackRate).toBe(2));
  });

  // side-effect-contract: stepping down past 0.5 clamps at 0.5 (AC-006 / TC-007 / E-6)
  it("should clamp the playbackRate to 0.5 if changeRate steps past the lower bound", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    const rateDown = screen.getByRole("button", { name: "rate-down" });
    for (let i = 0; i < 20; i += 1) {
      await user.click(rateDown);
    }

    expect(screen.getByLabelText("rate")).toHaveTextContent("0.5");
    await waitFor(() => expect(video.playbackRate).toBe(0.5));
  });

  // behavior: no rate readout is shown while the rate is 1.0 (AC-006 / Speed state)
  it("should not show a rate readout if the playback rate is 1", () => {
    renderProbe("v-1");

    expect(screen.queryByText(/^\s*1(\.0)?x\s*$/i)).not.toBeInTheDocument();
  });

  // behavior: a "1.5x" readout appears once the rate leaves 1.0 (AC-006 / TC-007 / Speed state)
  it("should show a '1.5x' readout if the rate is stepped to 1.5", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const rateUp = screen.getByRole("button", { name: "rate-up" });
    for (let i = 0; i < 5; i += 1) {
      await user.click(rateUp);
    }

    expect(screen.getByText(/1\.5x/i)).toBeInTheDocument();
  });
});

describe("extended transport: palette parity (AC-007)", () => {
  // behavior: opening the palette lists a command row for every one of the nine new actions (AC-007 / TC-009)
  it("should list a palette command for each new action if the palette is open", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/type a command/i),
      ).toBeInTheDocument(),
    );

    const newActionNames = [
      "seek-forward",
      "seek-back",
      "seek-forward-fine",
      "seek-back-fine",
      "volume-up",
      "volume-down",
      "toggle-mute",
      "speed-up",
      "speed-down",
    ].map((id) => {
      const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
      expect(action).toBeDefined();
      return action!.name;
    });

    newActionNames.forEach((name) => {
      expect(
        screen.getByRole("option", { name: new RegExp(name, "i") }),
      ).toBeInTheDocument();
    });
  });
});

describe("extended transport: hotkeys drive the element (AC-001..AC-006)", () => {
  // side-effect-contract: ArrowRight seeks the active element forward by 5s via the global hotkey (AC-001 / AC-002)
  it("should seek the element forward by 5s if ArrowRight is pressed in the workspace", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    const video = await findVideo();
    video.dispatchEvent(new Event("loadedmetadata"));
    // seed a known position/duration through the real timeupdate handler
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 60,
    });
    video.currentTime = 30;
    video.dispatchEvent(new Event("timeupdate"));

    await user.keyboard("{ArrowRight}");

    await waitFor(() => expect(video.currentTime).toBe(35));
  });

  // side-effect-contract: M mutes the active element via the global hotkey (AC-005 / TC-006)
  it("should mute the element if M is pressed in the workspace", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    const video = await findVideo();
    await user.keyboard("m");

    await waitFor(() => expect(video.muted).toBe(true));
  });

  // side-effect-contract: ] speeds the active element up via the global hotkey (AC-006 / TC-007)
  it("should raise the element playbackRate if ] is pressed in the workspace", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    const video = await findVideo();
    await user.keyboard("]");

    await waitFor(() => expect(video.playbackRate).toBeCloseTo(1.1));
  });
});

describe("extended transport: edge cases (E-2, E-8)", () => {
  // side-effect-contract: with an active video but unknown duration (0), seekBy lower-clamps only - it does NOT force the playhead back to 0 (E-2)
  it("should lower-clamp only and seek forward if seekBy runs with an unknown duration", async () => {
    const user = userEvent.setup();
    renderProbe("v-1", { current: 10, duration: 0 });

    await user.click(screen.getByRole("button", { name: "report-progress" }));
    await user.click(screen.getByRole("button", { name: "seek-by-plus-5" }));

    expect(screen.getByLabelText("seek-target")).toHaveTextContent("15");
  });

  // side-effect-contract: volume/mute/rate persist across an active-video switch (state is context-owned, not per-element) (E-8)
  it("should keep volume, mute and rate if the active video is switched", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await user.click(screen.getByRole("button", { name: "vol-down" }));
    await user.click(screen.getByRole("button", { name: "do-mute" }));
    await user.click(screen.getByRole("button", { name: "rate-up" }));

    await user.click(screen.getByRole("button", { name: "do-next" }));

    expect(screen.getByLabelText("active-id")).not.toHaveTextContent("v-1");
    expect(screen.getByLabelText("volume")).toHaveTextContent("0.95");
    expect(screen.getByLabelText("muted")).toHaveTextContent("true");
    expect(screen.getByLabelText("rate")).toHaveTextContent("1.1");
  });
});

describe("extended transport: no active video (AC-008)", () => {
  // behavior: every new verb is a safe no-op when nothing is active (AC-008 / E-1 / TC-008)
  it("should not throw and should keep volume/rate at defaults if the verbs run with no active video", async () => {
    const user = userEvent.setup();
    renderProbe(undefined, { current: 0, duration: 0 });

    await user.click(screen.getByRole("button", { name: "seek-by-plus-5" }));
    await user.click(screen.getByRole("button", { name: "seek-by-minus-5" }));
    await user.click(screen.getByRole("button", { name: "vol-down" }));
    await user.click(screen.getByRole("button", { name: "do-mute" }));
    await user.click(screen.getByRole("button", { name: "rate-up" }));

    expect(screen.getByLabelText("volume")).toHaveTextContent("1");
    expect(screen.getByLabelText("muted")).toHaveTextContent("false");
    expect(screen.getByLabelText("rate")).toHaveTextContent("1");
  });

  // behavior: the time readout stays empty when nothing is active, regardless of control use (AC-008 / Empty state)
  it("should keep the readout at --:-- / --:-- if controls are used with no active video", async () => {
    const user = userEvent.setup();
    renderProbe(undefined, { current: 0, duration: 0 });

    await user.click(screen.getByRole("button", { name: "seek-by-plus-5" }));

    expect(screen.getByText("--:-- / --:--")).toBeInTheDocument();
  });

  // behavior: clicking the mute button + volume slider with no active video is a safe no-op (AC-008 / Empty state / TC-008)
  it("should not throw and should keep the readout empty if the mute button and volume slider are used with no active video", async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: /^mute$/i }));

    const slider = screen.getByRole("slider", { name: /volume/i });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      bottom: 0,
      right: 100,
      height: 4,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    await user.pointer({
      keys: "[MouseLeft]",
      target: slider,
      coords: { clientX: 50, clientY: 0 },
    });

    expect(screen.getByText("--:-- / --:--")).toBeInTheDocument();
    expect(viewportName().getByText(/no video/i)).toBeInTheDocument();
  });
});
