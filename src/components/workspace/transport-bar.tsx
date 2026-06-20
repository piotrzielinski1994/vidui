import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { formatTime } from "@/components/workspace/format-time";
import {
  fractionFromPointer,
  seekSecondsFromPointer,
} from "@/components/workspace/seek-position";

const EMPTY_TIME = "--:-- / --:--";

// Bar buttons fill the bar's full height, square, no rounding - read as 1px-
// divided cells, not floating chips (docs/design.md Layout rule).
const BAR_BUTTON = "h-full w-12 rounded-none";

export function TransportBar() {
  const {
    activeVideo,
    isPlaying,
    playbackCurrentSec,
    playbackDurationSec,
    volume,
    isMuted,
    playbackRate,
    repeatMode,
    isShuffling,
    togglePlay,
    nextVideo,
    prevVideo,
    seek,
    setVolume,
    toggleMute,
    cycleRepeat,
    toggleShuffle,
  } = useWorkspace();
  const seekBarRef = useRef<HTMLDivElement>(null);
  const isScrubbing = useRef(false);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const isVolumeScrubbing = useRef(false);

  const timeReadout = activeVideo
    ? `${formatTime(playbackCurrentSec)} / ${formatTime(playbackDurationSec)}`
    : EMPTY_TIME;

  const progressFraction =
    playbackDurationSec > 0 ? playbackCurrentSec / playbackDurationSec : 0;

  const volumePercent = Math.round(volume * 100);

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

  const volumeFromEvent = (clientX: number) => {
    const bar = volumeBarRef.current;
    if (!bar) {
      return;
    }
    setVolume(fractionFromPointer(clientX, bar.getBoundingClientRect()));
  };

  const handleVolumePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    isVolumeScrubbing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    volumeFromEvent(event.clientX);
  };

  const handleVolumePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isVolumeScrubbing.current) {
      return;
    }
    volumeFromEvent(event.clientX);
  };

  const stopVolumeScrubbing = () => {
    isVolumeScrubbing.current = false;
  };

  return (
    <div className="relative grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center">
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
      {/* left zone (1fr) - mute toggle + volume slider + shuffle + repeat */}
      <div className="flex h-full items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label={isMuted ? "Unmute" : "Mute"}
          onClick={() => toggleMute()}
          className={`${BAR_BUTTON} border-r border-border`}
        >
          {isMuted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </Button>
        <div
          ref={volumeBarRef}
          role="slider"
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={volumePercent}
          onPointerDown={handleVolumePointerDown}
          onPointerMove={handleVolumePointerMove}
          onPointerUp={stopVolumeScrubbing}
          onPointerCancel={stopVolumeScrubbing}
          className="mx-3 flex h-2 w-24 cursor-pointer items-center"
        >
          <div className="h-px w-full bg-border">
            <div
              className="h-full bg-primary"
              style={{ width: `${volumePercent}%` }}
            />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Shuffle"
          aria-pressed={isShuffling}
          onClick={() => toggleShuffle()}
          className={`${BAR_BUTTON} border-l border-border ${
            isShuffling ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <Shuffle className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Repeat: ${repeatMode}`}
          onClick={() => cycleRepeat()}
          className={`${BAR_BUTTON} border-l border-border ${
            repeatMode === "off" ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {repeatMode === "one" ? (
            <Repeat1 className="size-4" />
          ) : (
            <Repeat className="size-4" />
          )}
        </Button>
      </div>
      <div className="flex h-full items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous"
          onClick={() => prevVideo()}
          className={`${BAR_BUTTON} border-l border-border`}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => togglePlay()}
          className={`${BAR_BUTTON} border-l border-border`}
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
          className={`${BAR_BUTTON} border-x border-border`}
        >
          <SkipForward className="size-4" />
        </Button>
      </div>
      {/* right zone (1fr) - rate readout (only off 1x) + time readout */}
      <div className="flex items-center justify-end gap-3 pr-4">
        {playbackRate !== 1 && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {playbackRate}x
          </span>
        )}
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {timeReadout}
        </span>
      </div>
    </div>
  );
}
