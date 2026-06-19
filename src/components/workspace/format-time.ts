export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}`;
}
