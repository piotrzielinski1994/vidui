export type VideoFormat = "MP4" | "MKV" | "MOV" | "WEBM" | "AVI";

export type VideoNode = {
  id: string;
  name: string;
  format: VideoFormat;
  path: string;
};
