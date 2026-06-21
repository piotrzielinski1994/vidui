export const FRAME_STEP_SEC = 1 / 30;

export function clampSeekTarget(
  current: number,
  delta: number,
  duration: number,
): number {
  const target = current + delta;
  const lowerClamped = Math.max(0, target);
  return duration > 0 ? Math.min(duration, lowerClamped) : lowerClamped;
}
