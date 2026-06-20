import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri JS plugins/api that tauri.ts wraps. tauri.ts is the SUT here,
// so we mock only the underlying Tauri primitives, never tauri.ts itself.
const open = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => open(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { openVideoFiles } from "@/lib/tauri";

describe("openVideoFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // behavior: a multi-select dialog of chosen paths returns an array of those paths (AC-001/AC-002)
  it("should return the selected paths as an array if several files are chosen", async () => {
    open.mockResolvedValue(["/v/a.mp4", "/v/b.mkv"]);

    await expect(openVideoFiles()).resolves.toEqual(["/v/a.mp4", "/v/b.mkv"]);
  });

  // behavior: a single selected path is normalised to a one-element array (AC-002)
  it("should normalise a single chosen path to a one-element array if one file is chosen", async () => {
    open.mockResolvedValue("/v/solo.mp4");

    await expect(openVideoFiles()).resolves.toEqual(["/v/solo.mp4"]);
  });

  // behavior: cancelling the picker (null) yields an empty array, never a throw (AC-003/E-1)
  it("should return an empty array if the picker is cancelled", async () => {
    open.mockResolvedValue(null);

    await expect(openVideoFiles()).resolves.toEqual([]);
  });

  // side-effect-contract: the dialog opens with multiple selection enabled (AC-001)
  it("should open the dialog with multiple selection enabled if called", async () => {
    open.mockResolvedValue([]);

    await openVideoFiles();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true }),
    );
  });
});
