import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { Workspace } from "@/components/workspace/workspace";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { createInMemorySettingsStore } from "@/lib/settings/in-memory-store";
import { settingsRoute } from "@/routes/settings";
import { SHORTCUT_ACTIONS } from "@/lib/shortcuts/registry";
import { fixtureVideos } from "./fixtures";

// Assert navigation without standing up a full router: stub useNavigate to a spy
// and Link to a plain anchor (the real Link reads a router context that is null
// when the component is rendered standalone). Everything else is preserved.
const navigateSpy = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigateSpy,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

// The workspace renders the Viewport, which reaches the Tauri IPC boundary;
// mock the seam (not the components) so the real <video> can mount under jsdom.
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

const OPEN_SETTINGS = SHORTCUT_ACTIONS.find((a) => a.id === "open-settings")!;

describe("settings navigation", () => {
  beforeEach(() => navigateSpy.mockClear());

  // side-effect-contract: the open-settings hotkey navigates to /settings (TC-012 / AC-010)
  it("should navigate to /settings if the open-settings hotkey is pressed in the workspace", async () => {
    const user = userEvent.setup();
    render(
      <HotkeysProvider>
        <SettingsProvider store={createInMemorySettingsStore()}>
          <WorkspaceProvider
            videos={fixtureVideos}
            initialActiveVideoId="v-1"
          >
            <Workspace />
          </WorkspaceProvider>
        </SettingsProvider>
      </HotkeysProvider>,
    );

    // SettingsProvider renders null until its async load resolves; wait for a
    // stable workspace affordance before firing keys (documented gotcha).
    await screen.findByRole("button", { name: /previous/i });

    // open-settings default binding is "Mod+," ; jsdom resolves Mod -> Control.
    expect(OPEN_SETTINGS.defaultHotkey).toBe("Mod+,");
    await user.keyboard("{Control>},{/Control}");

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith({ to: "/settings" }),
    );
  });

  // side-effect-contract: Escape on the settings route returns to / (TC-012 / AC-010)
  it("should navigate back to / if Escape is pressed on the settings route", async () => {
    const SettingsComponent = settingsRoute.options.component!;
    const user = userEvent.setup();
    render(
      <HotkeysProvider>
        <SettingsProvider store={createInMemorySettingsStore()}>
          <SettingsComponent />
        </SettingsProvider>
      </HotkeysProvider>,
    );

    // Wait for the loaded settings (the shortcuts heading) before firing keys.
    await screen.findByText(OPEN_SETTINGS.name);

    await user.keyboard("{Escape}");

    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith({ to: "/" }));
  });
});
