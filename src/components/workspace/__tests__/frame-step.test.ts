import { describe, it, expect } from "vitest";

import {
  FRAME_STEP_SEC,
  clampSeekTarget,
} from "@/components/workspace/frame-step";

describe("FRAME_STEP_SEC", () => {
  // behavior: a frame is the fixed 1/30s assumed step (AC-002)
  it("should equal 1/30 if read", () => {
    expect(FRAME_STEP_SEC).toBe(1 / 30);
  });
});

describe("clampSeekTarget", () => {
  // behavior: forward step adds 1/30s to the current position (AC-002 / TC-001)
  it("should return current+delta if the target is inside the bounds", () => {
    expect(clampSeekTarget(30, FRAME_STEP_SEC, 60)).toBeCloseTo(30.0333, 3);
  });

  // behavior: back step subtracts 1/30s from the current position (AC-002 / TC-002)
  it("should return current-delta if stepping back inside the bounds", () => {
    expect(clampSeekTarget(30, -FRAME_STEP_SEC, 60)).toBeCloseTo(29.9667, 3);
  });

  // behavior: the lower bound floors at 0 so a back-step at the start stays at 0 (AC-004 / TC-005)
  it("should clamp to 0 if the target would go below 0", () => {
    expect(clampSeekTarget(0.01, -FRAME_STEP_SEC, 60)).toBe(0);
  });

  // behavior: the upper bound ceils at the duration so a forward-step at the end stays at the end (AC-004 / TC-006)
  it("should clamp to the duration if the target would exceed it", () => {
    expect(clampSeekTarget(59.99, FRAME_STEP_SEC, 60)).toBe(60);
  });

  // behavior: with an unknown duration (0) only the lower bound is applied, forward is uncapped (AC-004 / TC-007)
  it("should lower-clamp only if the duration is unknown (0)", () => {
    expect(clampSeekTarget(10, FRAME_STEP_SEC, 0)).toBeCloseTo(10.0333, 3);
  });

  // behavior: the exact lower bound is preserved (boundary, AC-004)
  it("should return 0 if the target is exactly 0", () => {
    expect(clampSeekTarget(0, -FRAME_STEP_SEC, 60)).toBe(0);
  });

  // behavior: the exact upper bound is preserved (boundary, AC-004)
  it("should return the duration if the target lands exactly on it", () => {
    expect(clampSeekTarget(60, FRAME_STEP_SEC, 60)).toBe(60);
  });
});
