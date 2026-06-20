import type { VideoFormat, VideoNode } from "@/components/workspace/mock-data";

const EXTENSION_FORMAT: Record<string, VideoFormat> = {
  mp4: "MP4",
  mkv: "MKV",
  mov: "MOV",
  webm: "WEBM",
  avi: "AVI",
};

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function formatOf(name: string): VideoFormat {
  const extension = name.includes(".")
    ? (name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  return EXTENSION_FORMAT[extension] ?? "MP4";
}

export function videosFromPaths(paths: readonly string[]): VideoNode[] {
  return paths.map((path) => {
    const name = basename(path);
    return { id: path, name, format: formatOf(name), path };
  });
}
