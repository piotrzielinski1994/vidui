import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri JS plugins/api that tauri.ts wraps. tauri.ts is the SUT here,
// so we mock only the underlying Tauri primitives, never tauri.ts itself.
const open = vi.fn();
const invoke = vi.fn();
const convertFileSrc = vi.fn((path: string) => `asset://localhost/${path}`);

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => open(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  convertFileSrc: (path: string) => convertFileSrc(path),
}));

import { openVideoFiles, prepareMediaUrl } from "@/lib/tauri";

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

describe("prepareMediaUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // behavior: an http(s) URL (HLS playlist) is played as-is, NOT routed through the asset protocol (AC-007)
  it("should return an http url unchanged if the backend streams via HLS", async () => {
    invoke.mockResolvedValue({
      path: "http://localhost:51234/0/index.m3u8",
      transcoded: true,
      durationSec: 1922.581,
    });

    await expect(prepareMediaUrl("/v/clip.mkv")).resolves.toEqual({
      url: "http://localhost:51234/0/index.m3u8",
      durationSec: 1922.581,
    });
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  // behavior: a plain file path (passthrough) is fed through convertFileSrc -> asset protocol (AC-007)
  it("should route a file path through the asset protocol if the backend returns a path", async () => {
    invoke.mockResolvedValue({
      path: "/v/clip.mp4",
      transcoded: false,
      durationSec: null,
    });

    await expect(prepareMediaUrl("/v/clip.mp4")).resolves.toEqual({
      url: "asset://localhost//v/clip.mp4",
      durationSec: null,
    });
    expect(convertFileSrc).toHaveBeenCalledWith("/v/clip.mp4");
  });
});
