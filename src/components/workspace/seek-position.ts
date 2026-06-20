type Rect = { left: number; width: number };

export function seekSecondsFromPointer(
  clientX: number,
  rect: Rect,
  durationSec: number,
): number {
  if (durationSec <= 0 || rect.width <= 0) {
    return 0;
  }
  const fraction = Math.min(
    1,
    Math.max(0, (clientX - rect.left) / rect.width),
  );
  return fraction * durationSec;
}
