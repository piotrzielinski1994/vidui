import type { VideoNode } from "@/components/workspace/mock-data";

// Flat playlist fixture used by all workspace tests (v0.2 - NO folders/tree).
// Open order is deliberately NON-sorted: 1, 21, 3, 9, 12 so that the three
// orderings are pairwise distinct and a test can tell them apart:
//   open order    : 1, 21, 3, 9, 12
//   natural asc   : 1, 3, 9, 12, 21   (numeric prefix by VALUE, not lexical)
//   lexical asc   : 1, 12, 21, 3, 9   (what a naive string sort would give)
// Durations are picked so the mm:ss totals are known exactly:
//   83  -> "01:23"
//   596 -> "09:56"
//   125 -> "02:05"
//   7   -> "00:07"
//   3661-> "61:01"
// IDs are stable so initialActiveVideoId is deterministic.

export const fixtureVideos: VideoNode[] = [
  {
    id: "v-1",
    name: "1 - Opening",
    format: "MP4",
    resolution: "1080p",
    durationSec: 83,
  },
  {
    id: "v-21",
    name: "21 - Finale",
    format: "AVI",
    resolution: "2160p",
    durationSec: 596,
  },
  {
    id: "v-3",
    name: "3 - Intro",
    format: "MOV",
    resolution: "720p",
    durationSec: 125,
  },
  {
    id: "v-9",
    name: "9 - Interlude",
    format: "WEBM",
    resolution: "480p",
    durationSec: 7,
  },
  {
    id: "v-12",
    name: "12 - Bridge",
    format: "MKV",
    resolution: "1440p",
    durationSec: 3661,
  },
];

// Order of ids in OPEN order (as authored above).
export const openOrderNames = [
  "1 - Opening",
  "21 - Finale",
  "3 - Intro",
  "9 - Interlude",
  "12 - Bridge",
];

// Natural/numeric-aware ascending: by numeric prefix VALUE 1,3,9,12,21.
export const ascOrderNames = [
  "1 - Opening",
  "3 - Intro",
  "9 - Interlude",
  "12 - Bridge",
  "21 - Finale",
];

// Descending = reverse of asc.
export const descOrderNames = [...ascOrderNames].slice().reverse();

// Single-item playlist for the wrap-to-self edge case (E-4).
export const singleVideoList: VideoNode[] = [
  {
    id: "solo",
    name: "5 - Lonely",
    format: "MP4",
    resolution: "1080p",
    durationSec: 42,
  },
];

// Composite-sort fixture (v0.2 - multi-field tie-break chain). Designed so the
// three relevant orderings are pairwise distinct, proving a [type, title] chain
// differs from a title-only chain:
//   - >=2 videos share a format (MP4 x3, AVI x2) with different numeric prefixes
//   - formats interleave in title order so grouping-by-type reshuffles the list
// Format strings compare alphabetically: AVI < MKV < MOV < MP4 < WEBM.
// Open order is deliberately scrambled. Durations are unique so [duration]
// gives a fully-determined numeric order.
export const compositeFixture: VideoNode[] = [
  {
    id: "c-21",
    name: "21 - mp4 late",
    format: "MP4",
    resolution: "720p",
    durationSec: 100,
  },
  {
    id: "c-3",
    name: "3 - mp4 early",
    format: "MP4",
    resolution: "1080p",
    durationSec: 50,
  },
  {
    id: "c-2",
    name: "2 - avi mid",
    format: "AVI",
    resolution: "480p",
    durationSec: 200,
  },
  {
    id: "c-10",
    name: "10 - avi late",
    format: "AVI",
    resolution: "2160p",
    durationSec: 30,
  },
  {
    id: "c-1",
    name: "1 - mp4 first",
    format: "MP4",
    resolution: "1440p",
    durationSec: 300,
  },
];

// Title-only ascending (natural prefix value 1,2,3,10,21) - formats interleave.
export const compositeTitleAscNames = [
  "1 - mp4 first",
  "2 - avi mid",
  "3 - mp4 early",
  "10 - avi late",
  "21 - mp4 late",
];

// [type, title] ascending: group by format string (AVI < MP4), natural title
// within each group. Distinct from title-only order (first item differs).
export const compositeTypeTitleAscNames = [
  "2 - avi mid",
  "10 - avi late",
  "1 - mp4 first",
  "3 - mp4 early",
  "21 - mp4 late",
];

// [duration] ascending: numeric durationSec 30,50,100,200,300.
export const compositeDurationAscNames = [
  "10 - avi late",
  "3 - mp4 early",
  "21 - mp4 late",
  "2 - avi mid",
  "1 - mp4 first",
];
