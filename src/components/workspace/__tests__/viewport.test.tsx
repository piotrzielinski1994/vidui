import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspace/workspace-context";
import { Viewport } from "@/components/workspace/viewport";
import { fixtureVideos } from "./fixtures";

const prepareMediaUrl = vi.fn(
  (path: string): Promise<{ url: string; durationSec: number | null }> =>
    Promise.resolve({ url: `asset://localhost${path}`, durationSec: null }),
);

const toggleFullscreen = vi.fn(() => Promise.resolve());
const logPlayback = vi.fn((message: string) => {
  void message;
  return Promise.resolve();
});

vi.mock("@/lib/tauri", () => ({
  prepareMediaUrl: (path: string) => prepareMediaUrl(path),
  openVideoFiles: vi.fn(() => Promise.resolve([])),
  toggleFullscreen: () => toggleFullscreen(),
  logPlayback: (message: string) => logPlayback(message),
}));

function SelectButton({ id }: { id: string }) {
  const { selectNode } = useWorkspace();
  return <button onClick={() => selectNode(id)}>select-{id}</button>;
}

function PlayingProbe() {
  const { isPlaying } = useWorkspace();
  return <output aria-label="playing">{String(isPlaying)}</output>;
}

function CycleRepeatButton() {
  const { cycleRepeat } = useWorkspace();
  return <button onClick={() => cycleRepeat()}>cycle-repeat</button>;
}

function TogglePlayButton() {
  const { togglePlay } = useWorkspace();
  return <button onClick={() => togglePlay()}>toggle-play</button>;
}

function DurationProbe() {
  const { playbackDurationSec } = useWorkspace();
  return <output aria-label="duration">{playbackDurationSec}</output>;
}

const region = () => screen.getByRole("region", { name: /video viewport/i });
const findVideo = async () => {
  await waitFor(() =>
    expect(document.querySelector("video")).not.toBeNull(),
  );
  return document.querySelector("video") as HTMLVideoElement;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Viewport", () => {
  // behavior: active video renders inside an accessible region (AC-004)
  it("should expose an accessible video-viewport region if mounted", () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    expect(region()).toBeInTheDocument();
  });

  // behavior: active video renders a real <video> element once prepared (AC-004)
  it("should render a video element if a video is active", async () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    await findVideo();
  });

  // behavior: the file is prepared (probe/transcode) and its result is the <video> src (AC-003/AC-004)
  it("should source the video from the prepared url of the active path if a video is active", async () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    await waitFor(() =>
      expect(prepareMediaUrl).toHaveBeenCalledWith("/videos/3 - Intro.mov"),
    );
    const video = await findVideo();
    expect(video.getAttribute("src")).toContain(
      "asset://localhost/videos/3 - Intro.mov",
    );
  });

  // behavior: switching the active video prepares + sources the NEW file (AC-005)
  it("should source the newly selected file if selection switches", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
        <SelectButton id="v-9" />
      </WorkspaceProvider>,
    );

    await findVideo();
    await user.click(screen.getByRole("button", { name: "select-v-9" }));

    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video?.getAttribute("src")).toContain("9 - Interlude.webm");
    });
  });

  // behavior: a preparing state shows while the file is probed/transcoded (AC-004)
  it("should show a preparing state before the source is ready", async () => {
    let resolvePrepare: (source: {
      url: string;
      durationSec: number | null;
    }) => void = () => {};
    prepareMediaUrl.mockReturnValueOnce(
      new Promise<{ url: string; durationSec: number | null }>((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    expect(within(region()).getByText(/preparing/i)).toBeInTheDocument();

    resolvePrepare({
      url: "asset://localhost/videos/3 - Intro.mov",
      durationSec: null,
    });
    await findVideo();
  });

  // behavior: HLS streams report element.duration as Infinity, so the probed
  // duration is used for the readout instead of the bogus element value
  it("should report the probed duration if the element duration is not finite", async () => {
    prepareMediaUrl.mockResolvedValueOnce({
      url: "http://localhost:5000/0/index.m3u8",
      durationSec: 1922.581,
    });
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
        <DurationProbe />
      </WorkspaceProvider>,
    );

    const video = await findVideo();
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: Infinity,
    });
    fireEvent(video, new Event("loadedmetadata"));

    await waitFor(() =>
      expect(
        screen.getByLabelText("duration").textContent,
      ).toBe("1922.581"),
    );
  });

  // behavior: a prepare failure surfaces an error, never a silent black screen (AC-004)
  it("should show an error message if preparing the file fails", async () => {
    prepareMediaUrl.mockRejectedValueOnce(new Error("ffmpeg transcode failed"));
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    await waitFor(() =>
      expect(within(region()).getByText(/could not play/i)).toBeInTheDocument(),
    );
  });

  // behavior: one playback-timeline line is logged on first frame, and only once
  // even if canplay re-fires (AC-010/AC-012)
  it("should log a single playback timeline on the first canplay if the video becomes ready", async () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    const video = await findVideo();
    fireEvent(video, new Event("canplay"));
    fireEvent(video, new Event("canplay"));

    await waitFor(() => expect(logPlayback).toHaveBeenCalledTimes(1));
    expect(logPlayback.mock.calls[0][0]).toContain('playback "3 - Intro"');
    expect(logPlayback.mock.calls[0][0]).toContain("total");
  });

  // behavior: a prepare failure logs a failure marker, not a timeline (AC-012)
  it("should log a prepare-failure marker if preparing the file fails", async () => {
    prepareMediaUrl.mockRejectedValueOnce(new Error("ffmpeg transcode failed"));
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    await waitFor(() =>
      expect(logPlayback).toHaveBeenCalledWith(
        'playback "3 - Intro": prepare FAILED',
      ),
    );
  });

  // behavior: switching while playing plays the new source once its data loads
  it("should play the new source on loadeddata if switched while playing", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
        <SelectButton id="v-9" />
      </WorkspaceProvider>,
    );

    await findVideo();
    await user.click(screen.getByRole("button", { name: "select-v-9" }));

    const video = await findVideo();
    fireEvent.loadedData(video);

    expect(video.paused).toBe(false);
  });

  // behavior: repeat-one replays the finished video - on ended the same element seeks
  // to 0 AND resumes playback even though isPlaying was already true (FR-4 repeat-one).
  it("should resume playback from 0 on ended if repeat is one", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
        <CycleRepeatButton />
        <TogglePlayButton />
      </WorkspaceProvider>,
    );

    const video = await findVideo();
    await user.click(screen.getByRole("button", { name: "cycle-repeat" }));
    await user.click(screen.getByRole("button", { name: "cycle-repeat" }));
    // Start playback so isPlaying is ALREADY true when the video ends - the real
    // repeat-one path (the bug: flipping isPlaying true->true won't re-fire play).
    await user.click(screen.getByRole("button", { name: "toggle-play" }));

    fireEvent.loadedData(video);
    // A real browser PAUSES the element when it fires `ended`; jsdom doesn't, so
    // pause it explicitly to reproduce the post-end paused state before replaying.
    video.pause();
    fireEvent.ended(video);

    await waitFor(() => expect(video.currentTime).toBe(0));
    expect(video.paused).toBe(false);
  });

  // behavior: the active video's name is shown in the viewport once ready (AC-004)
  it("should show the active video's name if a video is active", async () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    await waitFor(() =>
      expect(within(region()).getByText(/3 - Intro/i)).toBeInTheDocument(),
    );
  });

  // behavior: the title overlay auto-hides after 5s of playback (AC-018)
  it("should hide the active video's name after 5 seconds", async () => {
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    await waitFor(() =>
      expect(within(region()).getByText(/3 - Intro/i)).toBeInTheDocument(),
    );

    await waitFor(
      () =>
        expect(within(region()).queryByText(/3 - Intro/i)).not.toBeInTheDocument(),
      { timeout: 6000 },
    );
  }, 8000);

  // behavior: switching the active video re-shows the title for the new file (AC-018)
  it("should re-show the title if the active video switches after the timeout", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
        <SelectButton id="v-9" />
      </WorkspaceProvider>,
    );

    await waitFor(() =>
      expect(within(region()).getByText(/3 - Intro/i)).toBeInTheDocument(),
    );
    await waitFor(
      () =>
        expect(within(region()).queryByText(/3 - Intro/i)).not.toBeInTheDocument(),
      { timeout: 6000 },
    );

    await user.click(screen.getByRole("button", { name: "select-v-9" }));

    await waitFor(() =>
      expect(within(region()).getByText(/9 - Interlude/i)).toBeInTheDocument(),
    );
  }, 8000);

  // side-effect-contract: double-clicking the viewport toggles native fullscreen (AC-006)
  it("should call toggleFullscreen once if the viewport is double-clicked", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
      </WorkspaceProvider>,
    );

    await user.dblClick(region());

    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  // side-effect-contract: a single click on the viewport toggles play/pause
  it("should toggle play to pause if the viewport is single-clicked", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
        <PlayingProbe />
      </WorkspaceProvider>,
    );

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");

    await user.click(region());

    await waitFor(() =>
      expect(screen.getByLabelText("playing")).toHaveTextContent("true"),
    );
  });

  // side-effect-contract: a double-click must NOT leave a stray single-click toggle behind
  it("should not toggle play if the viewport is double-clicked", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <Viewport />
        <PlayingProbe />
      </WorkspaceProvider>,
    );

    await user.dblClick(region());

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
  });

  // behavior: a single click with no active video is a safe no-op
  it("should not throw and stay paused if the viewport is single-clicked with no active video", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider videos={fixtureVideos}>
        <Viewport />
        <PlayingProbe />
      </WorkspaceProvider>,
    );

    await user.click(region());

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
  });

  // behavior: empty state placeholder + no <video> when nothing is active (Empty)
  it("should render a no-video placeholder and no video element if no video is active", () => {
    const { container } = render(
      <WorkspaceProvider videos={fixtureVideos}>
        <Viewport />
      </WorkspaceProvider>,
    );

    expect(within(region()).getByText(/no video/i)).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });
});
