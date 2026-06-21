import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { createInMemorySettingsStore } from "@/lib/settings/in-memory-store";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsStore,
} from "@/lib/settings/settings";

// Capture the props react-resizable-panels' Group receives so the test can read
// the wired defaultLayout and fire onLayoutChanged without a real pointer drag
// (jsdom has no layout engine). Only the Group is stubbed; the SUT is the
// WorkspaceLayout wiring + SettingsProvider persistence.
let groupProps: {
  defaultLayout?: Record<string, number>;
  onLayoutChanged?: (layout: Record<string, number>) => void;
} = {};

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: (props: Record<string, unknown>) => {
    groupProps = props as typeof groupProps;
    return <div data-testid="group">{props.children as React.ReactNode}</div>;
  },
  ResizablePanel: (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  ResizableHandle: () => <div data-testid="handle" />,
}));

// The viewport inside Content reaches the Tauri IPC boundary; mock the seam.
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

function spiedStore(initial?: Settings) {
  const inner = createInMemorySettingsStore(initial ?? DEFAULT_SETTINGS);
  const saveSpy = vi.fn(inner.save);
  const store: SettingsStore = { load: inner.load, save: saveSpy };
  return { store, saveSpy };
}

const renderLayout = (store: SettingsStore) =>
  render(
    <SettingsProvider store={store}>
      <WorkspaceProvider videos={[]}>
        <WorkspaceLayout />
      </WorkspaceProvider>
    </SettingsProvider>,
  );

describe("WorkspaceLayout panel-size persistence", () => {
  // behavior: the persisted panel layout seeds the group's defaultLayout on boot (AC-013)
  it("should pass the persisted layout to the resizable group as defaultLayout", async () => {
    const seeded: Settings = {
      ...DEFAULT_SETTINGS,
      layout: { sidebar: 30, content: 70 },
    };
    renderLayout(spiedStore(seeded).store);

    await screen.findByTestId("group");
    expect(groupProps.defaultLayout).toEqual({ sidebar: 30, content: 70 });
  });

  // side-effect-contract: resizing (onLayoutChanged) persists the new layout (AC-013)
  it("should persist the new layout via the store if the panels are resized", async () => {
    const { store, saveSpy } = spiedStore();
    renderLayout(store);

    await screen.findByTestId("group");
    groupProps.onLayoutChanged?.({ sidebar: 18, content: 82 });

    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    expect(saveSpy.mock.calls.at(-1)![0].layout).toEqual({
      sidebar: 18,
      content: 82,
    });
  });
});
