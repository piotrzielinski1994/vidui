import { describe, it, expect } from "vitest";

import { sortVideos } from "@/components/workspace/sort-natural";
import type { SortField } from "@/components/workspace/sort-natural";
import type { VideoNode } from "@/components/workspace/mock-data";
import {
  compositeFixture,
  compositeTitleAscNames,
  compositeTypeTitleAscNames,
} from "./fixtures";

const make = (
  name: string,
  overrides: Partial<VideoNode> = {},
): VideoNode => ({
  id: name,
  name,
  format: "MP4",
  path: `/videos/${name}.mp4`,
  ...overrides,
});

const names = (videos: VideoNode[]) => videos.map((v) => v.name);

describe("sortVideos", () => {
  // behavior: title key compares numeric prefixes by VALUE, so 3 precedes 21 (not lexical)
  it("should order numeric-prefixed names by integer value if keys is [title] asc", () => {
    const input = [make("1 - a"), make("21 - b"), make("3 - c")];

    const result = names(sortVideos(input, ["title"], "asc"));

    expect(result).toEqual(["1 - a", "3 - c", "21 - b"]);
  });

  // behavior: a larger title-only set sorts 1,3,9,12,21 - not lexical 1,12,21,3,9
  it("should sort the title key naturally if values span single and double digits", () => {
    const input = [
      make("12 - bridge"),
      make("1 - opening"),
      make("9 - interlude"),
      make("21 - finale"),
      make("3 - intro"),
    ];

    const result = names(sortVideos(input, ["title"], "asc"));

    expect(result).toEqual([
      "1 - opening",
      "3 - intro",
      "9 - interlude",
      "12 - bridge",
      "21 - finale",
    ]);
  });

  // behavior: non-prefixed names fall back to locale-aware base-sensitivity compare (E-5)
  it("should order non-prefixed names locale-aware if keys is [title] and no numeric prefix is present", () => {
    const input = [make("Charlie"), make("alpha"), make("Bravo")];

    const result = names(sortVideos(input, ["title"], "asc"));

    expect(result).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  // behavior: mixing prefixed and non-prefixed names must not throw (E-5)
  it("should sort a mix of prefixed and non-prefixed names without throwing if some names lack a numeric prefix", () => {
    const input = [
      make("apple"),
      make("3 - gamma"),
      make("banana"),
      make("21 - delta"),
    ];

    const run = () => sortVideos(input, ["title"], "asc");

    expect(run).not.toThrow();
    expect(names(run())).toHaveLength(4);
  });

  // behavior: a [type, title] chain groups by format string then natural title within each group
  it("should group by format then order by natural title within a format if keys is [type, title]", () => {
    const result = names(sortVideos(compositeFixture, ["type", "title"], "asc"));

    expect(result).toEqual(compositeTypeTitleAscNames);
  });

  // behavior: a [type, title] chain produces a DIFFERENT order than [title] alone (proves tie-break chaining)
  it("should differ from a title-only order if the primary key is type", () => {
    const titleOnly = names(sortVideos(compositeFixture, ["title"], "asc"));
    const typeThenTitle = names(
      sortVideos(compositeFixture, ["type", "title"], "asc"),
    );

    expect(titleOnly).toEqual(compositeTitleAscNames);
    expect(typeThenTitle).not.toEqual(titleOnly);
  });

  // behavior: an equal primary key falls through to the next key in the chain
  it("should fall through to the next key if videos are equal on the primary key", () => {
    const input = [
      make("3 - same", { format: "MP4" }),
      make("1 - same", { format: "MP4" }),
      make("2 - same", { format: "MP4" }),
    ];

    const result = names(sortVideos(input, ["type", "title"], "asc"));

    expect(result).toEqual(["1 - same", "2 - same", "3 - same"]);
  });

  // behavior: empty keys returns the videos in their original (open) order
  it("should return videos in original order if keys is empty", () => {
    const result = names(sortVideos(compositeFixture, [], "asc"));

    expect(result).toEqual(names(compositeFixture));
  });

  // behavior: empty keys ignores direction - desc still yields original order
  it("should return original order even for desc if keys is empty", () => {
    const result = names(sortVideos(compositeFixture, [], "desc"));

    expect(result).toEqual(names(compositeFixture));
  });

  // behavior: direction desc reverses the entire composite comparison result
  it("should reverse the whole composite order if direction is desc", () => {
    const asc = names(sortVideos(compositeFixture, ["type", "title"], "asc"));
    const desc = names(sortVideos(compositeFixture, ["type", "title"], "desc"));

    expect(desc).toEqual([...asc].reverse());
  });

  // side-effect-contract: pure - returns a new array, leaves the input untouched
  it("should return a new array and not mutate the input if called", () => {
    const input = [make("3 - c"), make("1 - a")];
    const before = names(input);

    const result = sortVideos(input, ["title"], "asc");

    expect(result).not.toBe(input);
    expect(names(input)).toEqual(before);
  });

  // side-effect-contract: empty keys also returns a fresh copy, not the same reference
  it("should return a copy and not the same reference if keys is empty", () => {
    const input = [make("3 - c"), make("1 - a")];

    const result = sortVideos(input, [], "asc");

    expect(result).not.toBe(input);
    expect(names(result)).toEqual(names(input));
  });

  // type-contract: SortField is now the narrowed union "title" | "type" only
  it("should accept every documented SortField in keys if used as a chain", () => {
    const keys: SortField[] = ["title", "type"];

    const run = () => sortVideos(compositeFixture, keys, "asc");

    expect(run).not.toThrow();
    expect(names(run())).toHaveLength(compositeFixture.length);
  });
});
