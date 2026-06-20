const MIN_RATE = 0.5;
const MAX_RATE = 2;

export function clampRate(rate: number): number {
  const rounded = Math.round(rate * 10) / 10;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rounded));
}
