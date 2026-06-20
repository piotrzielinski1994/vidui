import { describe, it, expect } from "vitest";

import {
  seekSecondsFromPointer,
  fractionFromPointer,
} from "@/components/workspace/seek-position";

describe("seekSecondsFromPointer", () => {
  // behavior: a click at the mid-point of the bar maps to half the duration
  it("should return half the duration if the pointer is at the bar mid-point", () => {
    const sec = seekSecondsFromPointer(50, { left: 0, width: 100 }, 60);

    expect(sec).toBe(30);
  });

  // behavior: the bar's left offset is subtracted before computing the fraction
  it("should account for the bar's left offset if the bar is not at x=0", () => {
    const sec = seekSecondsFromPointer(120, { left: 100, width: 200 }, 60);

    // (120-100)/200 = 0.1 -> 6s
    expect(sec).toBeCloseTo(6);
  });

  // behavior: a pointer left of the bar clamps to 0 (no negative seek)
  it("should clamp to 0 if the pointer is left of the bar start", () => {
    const sec = seekSecondsFromPointer(-20, { left: 0, width: 100 }, 60);

    expect(sec).toBe(0);
  });

  // behavior: a pointer past the bar end clamps to the full duration
  it("should clamp to the duration if the pointer is past the bar end", () => {
    const sec = seekSecondsFromPointer(999, { left: 0, width: 100 }, 60);

    expect(sec).toBe(60);
  });

  // behavior: an unknown duration (0) yields 0 - nothing to seek to (E-3)
  it("should return 0 if the duration is 0", () => {
    expect(seekSecondsFromPointer(50, { left: 0, width: 100 }, 0)).toBe(0);
  });

  // behavior: a zero-width bar (not laid out) yields 0 rather than dividing by zero
  it("should return 0 if the bar has no width", () => {
    expect(seekSecondsFromPointer(50, { left: 0, width: 0 }, 60)).toBe(0);
  });
});

describe("fractionFromPointer", () => {
  // behavior: the mid-point of the bar maps to 0.5 (shared by seek + volume sliders)
  it("should return 0.5 if the pointer is at the bar mid-point", () => {
    expect(fractionFromPointer(50, { left: 0, width: 100 })).toBe(0.5);
  });

  // behavior: the bar's left offset is subtracted before computing the fraction
  it("should account for the bar's left offset if the bar is not at x=0", () => {
    expect(fractionFromPointer(120, { left: 100, width: 200 })).toBeCloseTo(
      0.1,
    );
  });

  // behavior: a pointer left of the bar clamps to 0 (no negative fraction)
  it("should clamp to 0 if the pointer is left of the bar start", () => {
    expect(fractionFromPointer(-20, { left: 0, width: 100 })).toBe(0);
  });

  // behavior: a pointer past the bar end clamps to 1
  it("should clamp to 1 if the pointer is past the bar end", () => {
    expect(fractionFromPointer(999, { left: 0, width: 100 })).toBe(1);
  });

  // behavior: a zero-width bar (not laid out) yields 0 rather than dividing by zero
  it("should return 0 if the bar has no width", () => {
    expect(fractionFromPointer(50, { left: 0, width: 0 })).toBe(0);
  });
});
