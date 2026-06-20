import type { VideoNode } from "@/components/workspace/mock-data";

// Flat playlist fixture used by all workspace tests (v0.3 - real playback shape).
// VideoNode now carries a file `path`; mock-only `resolution`/`durationSec` are gone.
// Open order is deliberately NON-sorted: 1, 21, 3, 9, 12 so that the three
// orderings are pairwise distinct and a test can tell them apart:
//   open order    : 1, 21, 3, 9, 12
//   natural asc   : 1, 3, 9, 12, 21   (numeric prefix by VALUE, not lexical)
//   lexical asc   : 1, 12, 21, 3, 9   (what a naive string sort would give)
// IDs are stable so initialActiveVideoId is deterministic.

export const fixtureVideos: VideoNode[] = [
  {
    id: "v-1",
    name: "1 - Opening",
    format: "MP4",
    path: "/videos/1 - Opening.mp4",
  },
  {
    id: "v-21",
    name: "21 - Finale",
    format: "AVI",
    path: "/videos/21 - Finale.avi",
  },
  {
    id: "v-3",
    name: "3 - Intro",
    format: "MOV",
    path: "/videos/3 - Intro.mov",
  },
  {
    id: "v-9",
    name: "9 - Interlude",
    format: "WEBM",
    path: "/videos/9 - Interlude.webm",
  },
  {
    id: "v-12",
    name: "12 - Bridge",
    format: "MKV",
    path: "/videos/12 - Bridge.mkv",
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
    path: "/videos/5 - Lonely.mp4",
  },
];

// Composite-sort fixture (multi-field tie-break chain). Designed so the
// three relevant orderings are pairwise distinct, proving a [type, title] chain
// differs from a title-only chain:
//   - >=2 videos share a format (MP4 x3, AVI x2) with different numeric prefixes
//   - formats interleave in title order so grouping-by-type reshuffles the list
// Format strings compare alphabetically: AVI < MKV < MOV < MP4 < WEBM.
// Open order is deliberately scrambled.
export const compositeFixture: VideoNode[] = [
  {
    id: "c-21",
    name: "21 - mp4 late",
    format: "MP4",
    path: "/videos/21 - mp4 late.mp4",
  },
  {
    id: "c-3",
    name: "3 - mp4 early",
    format: "MP4",
    path: "/videos/3 - mp4 early.mp4",
  },
  {
    id: "c-2",
    name: "2 - avi mid",
    format: "AVI",
    path: "/videos/2 - avi mid.avi",
  },
  {
    id: "c-10",
    name: "10 - avi late",
    format: "AVI",
    path: "/videos/10 - avi late.avi",
  },
  {
    id: "c-1",
    name: "1 - mp4 first",
    format: "MP4",
    path: "/videos/1 - mp4 first.mp4",
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
