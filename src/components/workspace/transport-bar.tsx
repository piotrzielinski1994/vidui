import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { formatTime } from "@/components/workspace/format-time";

const EMPTY_TIME = "--:-- / --:--";

export function TransportBar() {
  const { activeVideo, isPlaying, togglePlay, nextVideo, prevVideo } =
    useWorkspace();

  const timeReadout = activeVideo
    ? `${formatTime(0)} / ${formatTime(activeVideo.durationSec)}`
    : EMPTY_TIME;

  return (
    <div className="relative grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4">
      <div
        role="progressbar"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={activeVideo?.durationSec ?? 0}
        aria-valuenow={0}
        className="absolute inset-x-0 top-0 h-px bg-border"
      >
        <div className="h-full w-0 bg-primary" />
      </div>
      {/* left zone (1fr) - reserved for future controls */}
      <div className="flex items-center gap-1" />
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous"
          onClick={() => prevVideo()}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => togglePlay()}
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next"
          onClick={() => nextVideo()}
        >
          <SkipForward className="size-4" />
        </Button>
      </div>
      {/* right zone (1fr) - time readout, room for future controls */}
      <div className="flex items-center justify-end gap-3">
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {timeReadout}
        </span>
      </div>
    </div>
  );
}
