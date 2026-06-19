export type VideoFormat = "MP4" | "MKV" | "MOV" | "WEBM" | "AVI";

export type VideoNode = {
  id: string;
  name: string;
  format: VideoFormat;
  resolution: string;
  durationSec: number;
};

export const mockVideos: VideoNode[] = [
  {
    id: "v-1",
    name: "1 - Opening",
    format: "MP4",
    resolution: "1080p",
    durationSec: 596,
  },
  {
    id: "v-21",
    name: "21 - Finale",
    format: "AVI",
    resolution: "2160p",
    durationSec: 888,
  },
  {
    id: "v-3",
    name: "3 - Intro",
    format: "MOV",
    resolution: "720p",
    durationSec: 142,
  },
  {
    id: "v-9",
    name: "9 - Interlude",
    format: "WEBM",
    resolution: "480p",
    durationSec: 45,
  },
  {
    id: "v-12",
    name: "12 - Bridge",
    format: "MKV",
    resolution: "1440p",
    durationSec: 305,
  },
];
