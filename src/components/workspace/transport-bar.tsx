import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { formatTime } from "@/components/workspace/format-time";
import { seekSecondsFromPointer } from "@/components/workspace/seek-position";

const EMPTY_TIME = "--:-- / --:--";

export function TransportBar() {
  const {
    activeVideo,
    isPlaying,
    playbackCurrentSec,
    playbackDurationSec,
    togglePlay,
    nextVideo,
    prevVideo,
    seek,
  } = useWorkspace();
  const seekBarRef = useRef<HTMLDivElement>(null);
  const isScrubbing = useRef(false);

  const timeReadout = activeVideo
    ? `${formatTime(playbackCurrentSec)} / ${formatTime(playbackDurationSec)}`
    : EMPTY_TIME;

  const progressFraction =
    playbackDurationSec > 0 ? playbackCurrentSec / playbackDurationSec : 0;

  const seekFromEvent = (clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar) {
      return;
    }
    seek(seekSecondsFromPointer(clientX, bar.getBoundingClientRect(), playbackDurationSec));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeVideo) {
      return;
    }
    isScrubbing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromEvent(event.clientX);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isScrubbing.current) {
      return;
    }
    seekFromEvent(event.clientX);
  };

  const stopScrubbing = () => {
    isScrubbing.current = false;
  };

  return (
    <div className="relative grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4">
      <div
        ref={seekBarRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={playbackDurationSec}
        aria-valuenow={playbackCurrentSec}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopScrubbing}
        onPointerCancel={stopScrubbing}
        className="absolute inset-x-0 top-0 flex h-2 -translate-y-1/2 cursor-pointer items-center"
      >
        <div className="h-px w-full bg-border">
          <div
            className="h-full bg-primary"
            style={{ width: `${progressFraction * 100}%` }}
          />
        </div>
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
