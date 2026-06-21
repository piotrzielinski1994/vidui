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
// components) so the real <video> can mount and reflect the transforms under jsdom.
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

// A probe that exposes the new viewportTransform state + verbs as observable DOM,
// plus selectNode so a test can switch the active video and assert stickiness.
function Probe() {
  const {
    viewportTransform,
    rotateClockwise,
    cycleFitMode,
    zoomBy,
    resetViewportTransform,
    selectNode,
    activeVideoId,
  } = useWorkspace();
  return (
    <div>
      <output aria-label="rotation">{String(viewportTransform.rotationDeg)}</output>
      <output aria-label="fit">{String(viewportTransform.fitMode)}</output>
      <output aria-label="zoom">{String(viewportTransform.zoom)}</output>
      <output aria-label="active-id">{String(activeVideoId)}</output>
      <button onClick={() => rotateClockwise()}>rotate-cw</button>
      <button onClick={() => cycleFitMode()}>cycle-fit</button>
      <button onClick={() => zoomBy(0.1)}>zoom-in</button>
      <button onClick={() => zoomBy(-0.1)}>zoom-out</button>
      <button onClick={() => resetViewportTransform()}>reset-viewport</button>
      <button onClick={() => selectNode("v-9")}>select-v-9</button>
    </div>
  );
}

const findVideo = async () => {
  await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
  return document.querySelector("video") as HTMLVideoElement;
};

const renderProbe = (initialActiveVideoId?: string) =>
  render(
    <WorkspaceProvider
      videos={fixtureVideos}
      initialActiveVideoId={initialActiveVideoId}
    >
      <TransportBar />
      <Viewport />
      <Probe />
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

const clickN = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  times: number,
) => {
  const button = screen.getByRole("button", { name });
  for (let i = 0; i < times; i += 1) {
    await user.click(button);
  }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("viewport transforms: rotate registry + verb + element (AC-001)", () => {
  // behavior: rotate-cw is registered as a global hotkey bound to Mod+Shift+R (AC-001)
  it("should register rotate-cw bound to Mod+Shift+R if read", () => {
    const rotate = SHORTCUT_ACTIONS.find((a) => a.id === "rotate-cw");

    expect(rotate?.defaultHotkey).toBe("Mod+Shift+R");
    expect(rotate?.name.trim().length).toBeGreaterThan(0);
    expect(rotate?.description.trim().length).toBeGreaterThan(0);
  });

  // side-effect-contract: four rotate-cw calls cycle rotationDeg 0->90->180->270->0 (AC-001 / TC-001)
  it("should cycle rotationDeg 0->90->180->270->0 if rotateClockwise is called four times", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await clickN(user, "rotate-cw", 1);
    expect(screen.getByLabelText("rotation")).toHaveTextContent("90");
    await clickN(user, "rotate-cw", 1);
    expect(screen.getByLabelText("rotation")).toHaveTextContent("180");
    await clickN(user, "rotate-cw", 1);
    expect(screen.getByLabelText("rotation")).toHaveTextContent("270");
    await clickN(user, "rotate-cw", 1);
    expect(screen.getByLabelText("rotation")).toHaveTextContent("0");
  });

  // side-effect-contract: the <video> inline transform includes rotate(90deg) after one rotate (AC-001 / TC-001)
  it("should set the element transform to include rotate(90deg) if rotated once", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await clickN(user, "rotate-cw", 1);

    await waitFor(() => expect(video.style.transform).toContain("rotate(90deg)"));
  });
});

describe("viewport transforms: fit-mode registry + verb + element (AC-002)", () => {
  // behavior: cycle-fit-mode is registered as a global hotkey bound to F (AC-002)
  it("should register cycle-fit-mode bound to F if read", () => {
    const fit = SHORTCUT_ACTIONS.find((a) => a.id === "cycle-fit-mode");

    expect(fit?.defaultHotkey).toBe("F");
    expect(fit?.name.trim().length).toBeGreaterThan(0);
    expect(fit?.description.trim().length).toBeGreaterThan(0);
  });

  // side-effect-contract: three cycle-fit calls cycle contain->cover->fill->contain (AC-002 / TC-002)
  it("should cycle fitMode contain->cover->fill->contain if cycleFitMode is called three times", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await clickN(user, "cycle-fit", 1);
    expect(screen.getByLabelText("fit")).toHaveTextContent("cover");
    await clickN(user, "cycle-fit", 1);
    expect(screen.getByLabelText("fit")).toHaveTextContent("fill");
    await clickN(user, "cycle-fit", 1);
    expect(screen.getByLabelText("fit")).toHaveTextContent("contain");
  });

  // side-effect-contract: the <video> object-fit reflects the current fit mode (AC-002 / TC-002)
  it("should set the element object-fit to cover if the fit mode is cycled once", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await clickN(user, "cycle-fit", 1);

    await waitFor(() => expect(video.style.objectFit).toBe("cover"));
  });
});

describe("viewport transforms: zoom registry + verb + element (AC-003)", () => {
  // behavior: zoom-in (=) and zoom-out (-) are registered as global hotkeys (AC-003)
  it("should register zoom-in bound to = and zoom-out bound to - if read", () => {
    const zoomIn = SHORTCUT_ACTIONS.find((a) => a.id === "zoom-in");
    const zoomOut = SHORTCUT_ACTIONS.find((a) => a.id === "zoom-out");

    expect(zoomIn?.defaultHotkey).toBe("=");
    expect(zoomOut?.defaultHotkey).toBe("-");
    expect(zoomIn?.name.trim().length).toBeGreaterThan(0);
    expect(zoomOut?.name.trim().length).toBeGreaterThan(0);
  });

  // side-effect-contract: five +0.1 steps reach zoom 1.5 and the element scales(1.5) (AC-003 / TC-003)
  it("should step zoom to 1.5 and set the element transform to include scale(1.5) if zoomed in five times", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await clickN(user, "zoom-in", 5);

    expect(screen.getByLabelText("zoom")).toHaveTextContent("1.5");
    await waitFor(() => expect(video.style.transform).toContain("scale(1.5)"));
  });

  // side-effect-contract: zooming in past the upper bound clamps zoom at 4 (AC-003 / TC-003 / E-2)
  it("should clamp zoom to 4 if zoomBy steps past the upper bound", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await clickN(user, "zoom-in", 40);

    expect(screen.getByLabelText("zoom")).toHaveTextContent("4");
  });

  // side-effect-contract: zooming out past the lower bound clamps zoom at 1 (AC-003 / TC-003 / E-2)
  it("should clamp zoom to 1 if zoomBy steps below the lower bound", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await clickN(user, "zoom-out", 5);

    expect(screen.getByLabelText("zoom")).toHaveTextContent("1");
  });

  // side-effect-contract: the zoomed element scales from its centre (AC-003)
  it("should set the element transform-origin to center if zoomed", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await clickN(user, "zoom-in", 1);

    await waitFor(() => expect(video.style.transformOrigin).toBe("center"));
  });
});

describe("viewport transforms: reset registry + verb + element (AC-004)", () => {
  // behavior: reset-viewport is registered as a global hotkey bound to Mod+0 (AC-004)
  it("should register reset-viewport bound to Mod+0 if read", () => {
    const reset = SHORTCUT_ACTIONS.find((a) => a.id === "reset-viewport");

    expect(reset?.defaultHotkey).toBe("Mod+0");
    expect(reset?.name.trim().length).toBeGreaterThan(0);
    expect(reset?.description.trim().length).toBeGreaterThan(0);
  });

  // side-effect-contract: reset restores rotation 0 / fit contain / zoom 1 on the element (AC-004 / TC-004)
  it("should restore rotation 0, fit contain and zoom 1 if reset after rotate+fit+zoom", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    const video = await findVideo();
    await clickN(user, "rotate-cw", 1);
    await clickN(user, "cycle-fit", 1);
    await clickN(user, "zoom-in", 5);
    await clickN(user, "reset-viewport", 1);

    expect(screen.getByLabelText("rotation")).toHaveTextContent("0");
    expect(screen.getByLabelText("fit")).toHaveTextContent("contain");
    expect(screen.getByLabelText("zoom")).toHaveTextContent("1");
    await waitFor(() => {
      expect(video.style.objectFit).toBe("contain");
      expect(video.style.transform).toContain("rotate(0deg)");
      expect(video.style.transform).toContain("scale(1)");
    });
  });

  // behavior: the transform readout disappears after reset (AC-004 / AC-007 / TC-004)
  it("should hide the transform readout if reset is triggered after a transform", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await clickN(user, "zoom-in", 5);
    expect(screen.getByText(/1\.5x/i)).toBeInTheDocument();

    await clickN(user, "reset-viewport", 1);

    expect(screen.queryByText(/1\.5x/i)).not.toBeInTheDocument();
  });
});

describe("viewport transforms: session-sticky across switch (AC-005)", () => {
  // side-effect-contract: transform state survives an active-video switch and the new element re-applies it (AC-005 / TC-005 / E-5)
  it("should keep rotation 90 and zoom 1.5 on the newly active video if the active video is switched", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await findVideo();
    await clickN(user, "rotate-cw", 1);
    await clickN(user, "zoom-in", 5);

    await user.click(screen.getByRole("button", { name: "select-v-9" }));

    expect(screen.getByLabelText("active-id")).not.toHaveTextContent("v-1");
    expect(screen.getByLabelText("rotation")).toHaveTextContent("90");
    expect(screen.getByLabelText("zoom")).toHaveTextContent("1.5");

    await waitFor(() => {
      const video = document.querySelector("video") as HTMLVideoElement | null;
      expect(video?.style.transform).toContain("rotate(90deg)");
      expect(video?.style.transform).toContain("scale(1.5)");
    });
  });
});

describe("viewport transforms: no active video no-ops (AC-006)", () => {
  // behavior: every transform verb is a safe no-op with no active video and leaves defaults (AC-006 / E-1 / TC-006)
  it("should not throw and should keep transform at defaults if the verbs run with no active video", async () => {
    const user = userEvent.setup();
    renderProbe(undefined);

    await clickN(user, "rotate-cw", 1);
    await clickN(user, "cycle-fit", 1);
    await clickN(user, "zoom-in", 1);
    await clickN(user, "zoom-out", 1);
    await clickN(user, "reset-viewport", 1);

    expect(screen.getByLabelText("rotation")).toHaveTextContent("0");
    expect(screen.getByLabelText("fit")).toHaveTextContent("contain");
    expect(screen.getByLabelText("zoom")).toHaveTextContent("1");
  });

  // behavior: no transform readout appears while nothing is active (AC-006 / AC-007 / TC-006)
  it("should show no transform readout if the verbs run with no active video", async () => {
    const user = userEvent.setup();
    renderProbe(undefined);

    await clickN(user, "rotate-cw", 1);
    await clickN(user, "zoom-in", 1);

    expect(screen.queryByText(/90deg/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\.1x/i)).not.toBeInTheDocument();
  });
});

describe("viewport transforms: transport readout visibility (AC-007)", () => {
  // behavior: no transform readout is shown while the transform is the default (AC-007 / TC-007)
  it("should show no transform readout if the transform is the default", () => {
    renderProbe("v-1");

    expect(screen.queryByText(/deg/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cover|fill/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/[0-9]\.[0-9]x/i)).not.toBeInTheDocument();
  });

  // behavior: a readout naming 1.1x appears once zoom leaves 1.0 (AC-007 / TC-007)
  it("should show a 1.1x readout if zoomed in once", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await clickN(user, "zoom-in", 1);

    expect(screen.getByText(/1\.1x/i)).toBeInTheDocument();
  });

  // behavior: the readout names each non-default facet when several differ (AC-007 / Combined state)
  it("should name 90deg, cover and 1.5x if rotation, fit and zoom are all non-default", async () => {
    const user = userEvent.setup();
    renderProbe("v-1");

    await clickN(user, "rotate-cw", 1);
    await clickN(user, "cycle-fit", 1);
    await clickN(user, "zoom-in", 5);

    // The single readout span names every non-default facet together; assert the
    // combined string so it doesn't collide with the probe's per-facet outputs.
    expect(screen.getByText("90deg cover 1.5x")).toBeInTheDocument();
  });
});

describe("viewport transforms: default element state (AC-008)", () => {
  // behavior: at defaults the element is object-fit contain + rotate(0deg) scale(1) and box-filling (AC-008)
  it("should render object-fit contain, transform rotate(0deg) scale(1) and h-full w-full at defaults", async () => {
    renderProbe("v-1");

    const video = await findVideo();

    await waitFor(() => {
      expect(video.style.objectFit).toBe("contain");
      expect(video.style.transform).toContain("rotate(0deg)");
      expect(video.style.transform).toContain("scale(1)");
    });
    expect(video.className).toContain("h-full");
    expect(video.className).toContain("w-full");
  });
});

describe("viewport transforms: palette parity (AC-009)", () => {
  // behavior: opening the palette lists a command row for each of the five new actions (AC-009 / TC-008)
  it("should list a palette command for each of the five new actions if the palette is open", async () => {
    const user = userEvent.setup();
    renderWorkspace({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/type a command/i),
      ).toBeInTheDocument(),
    );

    const newActionNames = [
      "rotate-cw",
      "cycle-fit-mode",
      "zoom-in",
      "zoom-out",
      "reset-viewport",
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
