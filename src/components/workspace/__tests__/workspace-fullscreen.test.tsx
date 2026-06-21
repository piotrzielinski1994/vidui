import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspace/workspace-context";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { createInMemorySettingsStore } from "@/lib/settings/in-memory-store";
import { fixtureVideos } from "./fixtures";

vi.mock("@/lib/tauri", () => ({
  logPlayback: vi.fn(() => Promise.resolve()),
  prepareMediaUrl: (path: string) =>
    Promise.resolve({ url: `asset://localhost${path}`, durationSec: null }),
  openVideoFiles: vi.fn(() => Promise.resolve([])),
}));

function Controls() {
  const { toggleSidebar, toggleTransport, setFullscreen } = useWorkspace();
  return (
    <div>
      <button onClick={() => toggleSidebar()}>do-toggle-sidebar</button>
      <button onClick={() => toggleTransport()}>do-toggle-transport</button>
      <button onClick={() => setFullscreen(true)}>enter-fullscreen</button>
      <button onClick={() => setFullscreen(false)}>exit-fullscreen</button>
    </div>
  );
}

const renderLayout = async () => {
  const result = render(
    <SettingsProvider store={createInMemorySettingsStore()}>
      <WorkspaceProvider videos={fixtureVideos} initialActiveVideoId="v-3">
        <WorkspaceLayout />
        <Controls />
      </WorkspaceProvider>
    </SettingsProvider>,
  );
  // SettingsProvider renders null until its async load resolves; wait for it.
  await screen.findByRole("button", { name: "enter-fullscreen" });
  return result;
};

const sidebarList = () => screen.queryByRole("list", { name: /playlist/i });
const transportButton = () =>
  screen.queryByRole("button", { name: /play|pause/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Chrome visibility is driven only by its own state (regression)", () => {
  // behavior: the sidebar toggle hides and shows the playlist (not gated on anything else)
  it("should hide then show the sidebar via its toggle", async () => {
    const user = userEvent.setup();
    await renderLayout();

    expect(sidebarList()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "do-toggle-sidebar" }));
    await waitFor(() => expect(sidebarList()).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "do-toggle-sidebar" }));
    await waitFor(() => expect(sidebarList()).toBeInTheDocument());
  });

  // behavior: the transport toggle hides and shows the transport bar
  it("should hide then show the transport bar via its toggle", async () => {
    const user = userEvent.setup();
    await renderLayout();

    expect(transportButton()).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "do-toggle-transport" }),
    );
    await waitFor(() => expect(transportButton()).not.toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: "do-toggle-transport" }),
    );
    await waitFor(() => expect(transportButton()).toBeInTheDocument());
  });

  // behavior: the viewport region survives a sidebar toggle (no remount churn)
  it("should keep the viewport region mounted if the sidebar is toggled", async () => {
    const user = userEvent.setup();
    await renderLayout();

    expect(
      screen.getByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "do-toggle-sidebar" }));

    expect(
      screen.getByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();
  });
});

describe("Fullscreen hides chrome immersively (AC-006)", () => {
  // behavior: entering fullscreen hides BOTH sidebar and transport bar
  it("should hide the sidebar and transport bar if fullscreen is entered", async () => {
    const user = userEvent.setup();
    await renderLayout();

    expect(sidebarList()).toBeInTheDocument();
    expect(transportButton()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "enter-fullscreen" }));

    await waitFor(() => expect(sidebarList()).not.toBeInTheDocument());
    expect(transportButton()).not.toBeInTheDocument();
  });

  // behavior: leaving fullscreen restores the chrome (no lock-out)
  it("should restore the sidebar and transport bar if fullscreen is exited", async () => {
    const user = userEvent.setup();
    await renderLayout();

    await user.click(screen.getByRole("button", { name: "enter-fullscreen" }));
    await waitFor(() => expect(sidebarList()).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "exit-fullscreen" }));

    await waitFor(() => expect(sidebarList()).toBeInTheDocument());
    expect(transportButton()).toBeInTheDocument();
  });

  // behavior (THE bug): the panel toggles still work WHILE fullscreen - the
  // sidebar can be brought back without leaving fullscreen (no lock-out).
  it("should let the sidebar toggle back on while still fullscreen", async () => {
    const user = userEvent.setup();
    await renderLayout();

    await user.click(screen.getByRole("button", { name: "enter-fullscreen" }));
    await waitFor(() => expect(sidebarList()).not.toBeInTheDocument());

    // still fullscreen - toggle sidebar back on
    await user.click(screen.getByRole("button", { name: "do-toggle-sidebar" }));
    await waitFor(() => expect(sidebarList()).toBeInTheDocument());

    // and the transport too
    await user.click(
      screen.getByRole("button", { name: "do-toggle-transport" }),
    );
    await waitFor(() => expect(transportButton()).toBeInTheDocument());
  });

  // behavior: exiting fullscreen RESTORES the pre-fullscreen chrome, not defaults
  it("should keep the sidebar hidden after a fullscreen round-trip if it was hidden before", async () => {
    const user = userEvent.setup();
    await renderLayout();

    // windowed: hide the sidebar (keep transport visible)
    await user.click(screen.getByRole("button", { name: "do-toggle-sidebar" }));
    await waitFor(() => expect(sidebarList()).not.toBeInTheDocument());
    expect(transportButton()).toBeInTheDocument();

    // enter then exit fullscreen
    await user.click(screen.getByRole("button", { name: "enter-fullscreen" }));
    await waitFor(() => expect(transportButton()).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "exit-fullscreen" }));

    // sidebar stays HIDDEN (its pre-fullscreen state), transport returns visible
    await waitFor(() => expect(transportButton()).toBeInTheDocument());
    expect(sidebarList()).not.toBeInTheDocument();
  });

  // behavior: the viewport survives entering fullscreen (no remount -> playback intact)
  it("should keep the viewport region mounted if fullscreen is entered", async () => {
    const user = userEvent.setup();
    await renderLayout();

    await user.click(screen.getByRole("button", { name: "enter-fullscreen" }));

    expect(
      screen.getByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();
  });
});
