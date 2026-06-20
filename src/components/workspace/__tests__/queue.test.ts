import { describe, it, expect } from "vitest";

import {
  nextRepeatMode,
  shuffleIds,
  reconcileOrder,
  decideOnEnded,
} from "@/components/workspace/queue";

describe("nextRepeatMode", () => {
  // behavior: cycles off -> all (TC-008 core)
  it("should return all if mode is off", () => {
    expect(nextRepeatMode("off")).toBe("all");
  });

  // behavior: cycles all -> one (TC-008 core)
  it("should return one if mode is all", () => {
    expect(nextRepeatMode("all")).toBe("one");
  });

  // behavior: cycles one -> off, closing the loop (TC-008 core)
  it("should return off if mode is one", () => {
    expect(nextRepeatMode("one")).toBe("off");
  });

  // behavior: three steps from off return to off (TC-008 full cycle)
  it("should return to off if applied three times from off", () => {
    expect(nextRepeatMode(nextRepeatMode(nextRepeatMode("off")))).toBe("off");
  });
});

describe("shuffleIds", () => {
  // behavior: result is a permutation - same multiset as input (TC-011)
  it("should return the same multiset if shuffled with a constant rng of 0", () => {
    const input = ["a", "b", "c", "d"];
    const result = shuffleIds(input, () => 0);

    expect([...result].sort()).toEqual([...input].sort());
  });

  // behavior: result is a permutation under a different constant rng (TC-011)
  it("should return the same multiset if shuffled with a constant rng of 0.99", () => {
    const input = ["a", "b", "c", "d"];
    const result = shuffleIds(input, () => 0.99);

    expect([...result].sort()).toEqual([...input].sort());
  });

  // behavior: result length matches input (no drops, no dupes) (TC-011)
  it("should return an array of the same length if shuffled", () => {
    const input = ["a", "b", "c", "d"];

    expect(shuffleIds(input, () => 0.5)).toHaveLength(input.length);
  });

  // behavior: deterministic for a fixed rng - same rng yields same arrangement (TC-011)
  it("should produce an identical arrangement if the same fixed rng is used twice", () => {
    const input = ["a", "b", "c", "d"];
    const rng = () => 0.42;

    expect(shuffleIds(input, rng)).toEqual(shuffleIds(input, rng));
  });

  // behavior: does not mutate the input array (purity, TC-011)
  it("should leave the input array unchanged if shuffled", () => {
    const input = ["a", "b", "c", "d"];
    shuffleIds(input, () => 0.7);

    expect(input).toEqual(["a", "b", "c", "d"]);
  });

  // behavior: actually reorders - an identity no-op would pass the permutation
  // checks above, so pin that a low rng moves elements off their original spots (TC-011)
  it("should produce a different arrangement than the input if rng moves elements", () => {
    const input = ["a", "b", "c", "d"];

    expect(shuffleIds(input, () => 0)).not.toEqual(input);
  });

  // behavior: empty input returns empty (edge)
  it("should return an empty array if the input is empty", () => {
    expect(shuffleIds([], () => 0.5)).toEqual([]);
  });
});

describe("reconcileOrder", () => {
  // behavior: keeps existing order, drops missing, appends new at end (TC-012)
  it("should keep order, drop missing and append new ids if ids changed", () => {
    expect(reconcileOrder(["b", "a", "c"], ["a", "b", "c", "d"])).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  // behavior: entries present in order but gone from ids are dropped (TC-012)
  it("should drop entries that are no longer in ids if some were removed", () => {
    expect(reconcileOrder(["b", "a", "c"], ["a", "c"])).toEqual(["a", "c"]);
  });

  // behavior: brand new ids land at the end preserving the prior order (TC-012)
  it("should append all new ids at the end if order was empty", () => {
    expect(reconcileOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  // behavior: an unchanged id set yields the same order (TC-012)
  it("should return the same order if ids match the order exactly", () => {
    expect(reconcileOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("decideOnEnded", () => {
  const order = ["a", "b", "c"];

  // behavior: mid-list off advances to the next id (TC-010)
  it("should advance to the next id if mode is off and not last", () => {
    expect(decideOnEnded(order, "a", "off")).toEqual({
      kind: "advance",
      id: "b",
    });
  });

  // behavior: last + off stops (no wrap) (TC-010)
  it("should stop if mode is off and the active is last", () => {
    expect(decideOnEnded(order, "c", "off")).toEqual({ kind: "stop" });
  });

  // behavior: last + all wraps to the first id (TC-010)
  it("should advance to the first id if mode is all and the active is last", () => {
    expect(decideOnEnded(order, "c", "all")).toEqual({
      kind: "advance",
      id: "a",
    });
  });

  // behavior: repeat-one replays regardless of position (TC-010)
  it("should replay if mode is one", () => {
    expect(decideOnEnded(order, "b", "one")).toEqual({ kind: "replay" });
  });

  // behavior: single video + all -> next equals active -> replay, not a dead advance (TC-010 / E-2)
  it("should replay if there is a single video and mode is all", () => {
    expect(decideOnEnded(["a"], "a", "all")).toEqual({ kind: "replay" });
  });
});
