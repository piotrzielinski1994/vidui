import { describe, it, expect } from "vitest";

import { videosFromPaths } from "@/components/workspace/videos-from-paths";

describe("videosFromPaths", () => {
  // behavior: name is the file basename (filename incl. extension) of the path (spec §5)
  it("should use the file basename as the node name if given an absolute path", () => {
    const [node] = videosFromPaths(["/home/user/clips/myclip.mp4"]);

    expect(node.name).toBe("myclip.mp4");
  });

  // behavior: id and path both equal the absolute input path (data model §5)
  it("should set both id and path to the input path if given a path", () => {
    const path = "/home/user/clips/myclip.mp4";

    const [node] = videosFromPaths([path]);

    expect(node.id).toBe(path);
    expect(node.path).toBe(path);
  });

  // behavior: each known extension upcases to its VideoFormat (data model §5)
  it("should derive MP4 from a .mp4 extension if mapping a path", () => {
    expect(videosFromPaths(["/v/a.mp4"])[0].format).toBe("MP4");
  });

  it("should derive MKV from a .mkv extension if mapping a path", () => {
    expect(videosFromPaths(["/v/a.mkv"])[0].format).toBe("MKV");
  });

  it("should derive MOV from a .mov extension if mapping a path", () => {
    expect(videosFromPaths(["/v/a.mov"])[0].format).toBe("MOV");
  });

  it("should derive WEBM from a .webm extension if mapping a path", () => {
    expect(videosFromPaths(["/v/a.webm"])[0].format).toBe("WEBM");
  });

  it("should derive AVI from a .avi extension if mapping a path", () => {
    expect(videosFromPaths(["/v/a.avi"])[0].format).toBe("AVI");
  });

  // behavior: extension casing is normalised before mapping
  it("should map an uppercase .MP4 extension to MP4 if the case differs", () => {
    expect(videosFromPaths(["/v/A.MP4"])[0].format).toBe("MP4");
  });

  // behavior: unknown/unrecognised extension defaults to MP4 (E-5)
  it("should default the format to MP4 if the extension is unrecognised", () => {
    expect(videosFromPaths(["/v/weird.xyz"])[0].format).toBe("MP4");
  });

  // behavior: a path with no extension at all still defaults to MP4 (E-5)
  it("should default the format to MP4 if the path has no extension", () => {
    expect(videosFromPaths(["/v/noext"])[0].format).toBe("MP4");
  });

  // behavior: multiple paths map 1:1 preserving the input order (AC-002)
  it("should preserve the input order if given multiple paths", () => {
    const result = videosFromPaths([
      "/v/2 - second.mp4",
      "/v/1 - first.mkv",
      "/v/3 - third.mov",
    ]);

    expect(result.map((n) => n.name)).toEqual([
      "2 - second.mp4",
      "1 - first.mkv",
      "3 - third.mov",
    ]);
  });

  // behavior: empty input yields an empty array (AC-003 / E-1 supporting)
  it("should return an empty array if given no paths", () => {
    expect(videosFromPaths([])).toEqual([]);
  });
});
