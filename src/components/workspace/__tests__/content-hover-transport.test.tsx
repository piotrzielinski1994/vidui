import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { Content } from "@/components/workspace/content";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { createInMemorySettingsStore } from "@/lib/settings/in-memory-store";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings/settings";
import { fixtureVideos } from "./fixtures";

vi.mock("@/lib/tauri", () => ({
  logPlayback: vi.fn(() => Promise.resolve()),
  prepareMediaUrl: (path: string) =>
    Promise.resolve({ url: `asset://localhost${path}`, durationSec: null }),
  openVideoFiles: vi.fn(() => Promise.resolve([])),
  toggleFullscreen: vi.fn(() => Promise.resolve()),
}));

const renderContent = (
  settings: Settings,
  workspace: { transportHidden?: boolean } = {},
) =>
  render(
    <SettingsProvider store={createInMemorySettingsStore(settings)}>
      <WorkspaceProvider
        videos={fixtureVideos}
        initialActiveVideoId="v-3"
        initialTransportHidden={workspace.transportHidden}
      >
        <Content />
      </WorkspaceProvider>
    </SettingsProvider>,
  );

const transportButton = () =>
  screen.queryByRole("button", { name: /play|pause/i });
const viewport = () => screen.getByRole("region", { name: /video viewport/i });

afterEach(() => {
  vi.useRealTimers();
});

describe("Content transport reveal-on-hover", () => {
  // behavior: a docked (visible) transport renders regardless of hover (AC-009 unchanged)
  it("should always show the transport if it is not hidden", async () => {
    renderContent({ ...DEFAULT_SETTINGS }, { transportHidden: false });

    expect(
      await screen.findByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();
    expect(transportButton()).toBeInTheDocument();
  });

  // behavior: moving the mouse over a hidden video reveals the transport instantly (AC-014)
  it("should reveal the hidden transport instantly on mouse move if reveal-on-hover is on", async () => {
    renderContent(
      { ...DEFAULT_SETTINGS, revealTransportOnHover: true },
      { transportHidden: true },
    );

    await screen.findByRole("region", { name: /video viewport/i });
    expect(transportButton()).not.toBeInTheDocument();

    fireEvent.mouseMove(viewport());

    await waitFor(() => expect(transportButton()).toBeInTheDocument());
  });

  // behavior: after 3s without movement the revealed transport auto-hides (AC-016)
  it("should auto-hide the transport after 3000ms of no mouse movement", async () => {
    vi.useFakeTimers();
    renderContent(
      { ...DEFAULT_SETTINGS, revealTransportOnHover: true },
      { transportHidden: true },
    );

    // let the async settings load resolve under fake timers
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.mouseMove(viewport());
    expect(transportButton()).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(transportButton()).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(transportButton()).not.toBeInTheDocument();
  });

  // behavior: a fresh mouse move re-reveals after an idle auto-hide, and resets the timer (AC-016)
  it("should re-reveal on a new move after auto-hiding, restarting the idle timer", async () => {
    vi.useFakeTimers();
    renderContent(
      { ...DEFAULT_SETTINGS, revealTransportOnHover: true },
      { transportHidden: true },
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.mouseMove(viewport());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(transportButton()).not.toBeInTheDocument();

    // a new move re-reveals
    fireEvent.mouseMove(viewport());
    expect(transportButton()).toBeInTheDocument();

    // a move at 2000ms resets the timer, so it survives past the original 3000ms
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.mouseMove(viewport());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(transportButton()).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(transportButton()).not.toBeInTheDocument();
  });

  // behavior: leaving the video hides the transport immediately (AC-016)
  it("should hide the transport immediately on mouse leave", async () => {
    vi.useFakeTimers();
    renderContent(
      { ...DEFAULT_SETTINGS, revealTransportOnHover: true },
      { transportHidden: true },
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.mouseMove(viewport());
    expect(transportButton()).toBeInTheDocument();

    fireEvent.mouseLeave(viewport());
    expect(transportButton()).not.toBeInTheDocument();
  });

  // behavior: the bar stays open past the idle timeout while the cursor is over it (AC-017)
  it("should not auto-hide the transport while the mouse is over the bar", async () => {
    vi.useFakeTimers();
    renderContent(
      { ...DEFAULT_SETTINGS, revealTransportOnHover: true },
      { transportHidden: true },
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.mouseMove(viewport());
    const bar = screen.getByTestId("transport-overlay");
    fireEvent.mouseEnter(bar);

    // idle timer would have fired by now (past the 3s timeout), but cursor is on the bar
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(transportButton()).toBeInTheDocument();

    // leaving the bar (back onto the video) restarts the idle countdown
    fireEvent.mouseLeave(bar);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(transportButton()).not.toBeInTheDocument();
  });

  // behavior: moving the mouse ON the bar (events bubble to the wrapper) still does not arm the hide timer (AC-017)
  it("should stay open while the mouse moves over the bar itself", async () => {
    vi.useFakeTimers();
    renderContent(
      { ...DEFAULT_SETTINGS, revealTransportOnHover: true },
      { transportHidden: true },
    );
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.mouseMove(viewport());
    const bar = screen.getByTestId("transport-overlay");
    fireEvent.mouseEnter(bar);

    // a move over the bar bubbles up to the wrapper's onMouseMove - must NOT re-arm
    fireEvent.mouseMove(bar);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(transportButton()).toBeInTheDocument();
  });

  // behavior: with reveal-on-hover OFF a hidden transport never appears on move (AC-014)
  it("should not reveal the hidden transport on move if reveal-on-hover is off", async () => {
    renderContent(
      { ...DEFAULT_SETTINGS, revealTransportOnHover: false },
      { transportHidden: true },
    );

    await screen.findByRole("region", { name: /video viewport/i });
    expect(transportButton()).not.toBeInTheDocument();

    fireEvent.mouseMove(viewport());

    expect(transportButton()).not.toBeInTheDocument();
  });
});
