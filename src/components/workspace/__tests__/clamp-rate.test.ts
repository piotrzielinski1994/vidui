import { describe, it, expect } from "vitest";

import { clampRate } from "@/components/workspace/clamp-rate";

describe("clampRate", () => {
  // behavior: a value already inside the band is returned unchanged (AC-006)
  it("should return the rate unchanged if it is within [0.5, 2.0]", () => {
    expect(clampRate(1.5)).toBe(1.5);
  });

  // behavior: the lower bound floors at 0.5 (AC-006 / E-6)
  it("should clamp to 0.5 if the rate is below the lower bound", () => {
    expect(clampRate(0.3)).toBe(0.5);
  });

  // behavior: the upper bound ceils at 2.0 (AC-006 / E-6)
  it("should clamp to 2.0 if the rate is above the upper bound", () => {
    expect(clampRate(2.5)).toBe(2);
  });

  // behavior: float drift from repeated +0.1 steps is removed by 1-decimal rounding (E-6)
  it("should round to 1 decimal if the rate carries float drift", () => {
    expect(clampRate(1.0000000002)).toBe(1);
  });

  // behavior: a value needing rounding up to 1 decimal is rounded, not truncated (E-6)
  it("should round 1.25 to 1.3 if the rate needs 1-decimal rounding", () => {
    expect(clampRate(1.25)).toBe(1.3);
  });

  // behavior: the exact lower bound is preserved (boundary, AC-006)
  it("should return 0.5 if the rate is exactly the lower bound", () => {
    expect(clampRate(0.5)).toBe(0.5);
  });

  // behavior: the exact upper bound is preserved (boundary, AC-006)
  it("should return 2.0 if the rate is exactly the upper bound", () => {
    expect(clampRate(2)).toBe(2);
  });
});
