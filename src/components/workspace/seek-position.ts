type Rect = { left: number; width: number };

export function fractionFromPointer(clientX: number, rect: Rect): number {
  if (rect.width <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

export function seekSecondsFromPointer(
  clientX: number,
  rect: Rect,
  durationSec: number,
): number {
  if (durationSec <= 0) {
    return 0;
  }
  return fractionFromPointer(clientX, rect) * durationSec;
}
