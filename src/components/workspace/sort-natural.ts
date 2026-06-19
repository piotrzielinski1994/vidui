import type { VideoNode } from "@/components/workspace/mock-data";

export type SortField = "title" | "type" | "duration" | "resolution";

function numericPrefix(name: string): number | null {
  const match = name.match(/^\s*(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function compareTitle(a: VideoNode, b: VideoNode): number {
  const prefixA = numericPrefix(a.name);
  const prefixB = numericPrefix(b.name);
  if (prefixA !== null && prefixB !== null && prefixA !== prefixB) {
    return prefixA - prefixB;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

const FIELD_COMPARATORS: Record<
  SortField,
  (a: VideoNode, b: VideoNode) => number
> = {
  title: compareTitle,
  type: (a, b) => a.format.localeCompare(b.format),
  duration: (a, b) => a.durationSec - b.durationSec,
  resolution: (a, b) => a.resolution.localeCompare(b.resolution),
};

export function sortVideos(
  videos: VideoNode[],
  keys: SortField[],
  direction: "asc" | "desc",
): VideoNode[] {
  if (keys.length === 0) {
    return [...videos];
  }
  const sign = direction === "desc" ? -1 : 1;
  return [...videos].sort((a, b) => {
    for (const key of keys) {
      const result = FIELD_COMPARATORS[key](a, b);
      if (result !== 0) {
        return result * sign;
      }
    }
    return 0;
  });
}
