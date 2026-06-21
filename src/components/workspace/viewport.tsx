import { useEffect, useRef, useState } from "react";
import { Film, Loader2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { prepareMediaUrl, toggleFullscreen, logPlayback } from "@/lib/tauri";
import { formatTimeline } from "@/lib/playback-timing";

function logPlayError(error: unknown) {
  console.error("video play() rejected", error);
}

type TimelineMarks = {
  forId: string;
  name: string;
  activatedAtMs: number;
  prepareResolvedAtMs: number | null;
  firstFrameAtMs: number | null;
};

type SourceState =
  | { status: "ready"; forId: string; url: string; durationSec: number | null }
  | { status: "error"; forId: string; message: string };

// HLS streams report `<video>.duration` as Infinity (and NaN before metadata),
// so prefer the element's value only when it's a real finite length; otherwise
// fall back to the duration ffprobe gave us at prepare time.
function resolveDuration(elementDuration: number, probed: number | null): number {
  if (Number.isFinite(elementDuration) && elementDuration > 0) {
    return elementDuration;
  }
  return probed ?? 0;
}

export function Viewport() {
  const {
    activeVideo,
    isPlaying,
    seekToSec,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    viewportTransform,
    togglePlay,
    reportProgress,
    reportEnded,
  } = useWorkspace();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<SourceState | null>(null);
  const [titleHiddenForId, setTitleHiddenForId] = useState<string | null>(null);
  // Drop->first-frame timeline marks for the active video. Best-effort timing for
  // the log file; never gates render. Emitted once all three marks land.
  const timelineRef = useRef<TimelineMarks | null>(null);

  const emitTimelineOnFirstFrame = () => {
    const marks = timelineRef.current;
    if (!marks || marks.prepareResolvedAtMs === null) {
      return;
    }
    if (marks.firstFrameAtMs !== null) {
      return;
    }
    marks.firstFrameAtMs = performance.now();
    void logPlayback(
      formatTimeline(marks.name, {
        activatedAtMs: marks.activatedAtMs,
        prepareResolvedAtMs: marks.prepareResolvedAtMs,
        firstFrameAtMs: marks.firstFrameAtMs,
      }),
    );
  };

  // The title is a brief intro card, not a permanent watermark: visible for 5s
  // whenever the active video changes, then the timer marks THIS id as hidden.
  // Switching files changes the id, so the title re-shows for the new one.
  const TITLE_VISIBLE_MS = 5000;
  useEffect(() => {
    const id = activeVideo?.id;
    if (id === undefined) {
      return;
    }
    const timer = setTimeout(() => setTitleHiddenForId(id), TITLE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [activeVideo?.id]);

  // A single click toggles play/pause instantly (no debounce, so it feels as
  // snappy as the transport button). A double click goes fullscreen: the DOM
  // fires `click` twice before `dblclick`, so the two toggles cancel out (net
  // no change) and fullscreen lands on top - no stray toggle, no delay.
  const handleClick = () => {
    if (!activeVideo) {
      return;
    }
    togglePlay();
  };

  // Resolve the playable source for the active file. The Rust side probes it and
  // transcodes unsupported codecs (AV1/VP9/Opus/...) to H.264/AAC, which can take
  // a few seconds. While the resolved source is not (yet) for the active video,
  // we render the "preparing" state - no synchronous reset needed.
  useEffect(() => {
    if (!activeVideo) {
      return;
    }
    let cancelled = false;
    const forId = activeVideo.id;
    timelineRef.current = {
      forId,
      name: activeVideo.name,
      activatedAtMs: performance.now(),
      prepareResolvedAtMs: null,
      firstFrameAtMs: null,
    };
    prepareMediaUrl(activeVideo.path)
      .then(({ url, durationSec }) => {
        const marks = timelineRef.current;
        if (marks && marks.forId === forId) {
          marks.prepareResolvedAtMs = performance.now();
        }
        if (!cancelled) {
          setSource({ status: "ready", forId, url, durationSec });
        }
      })
      .catch((error) => {
        console.error("prepare_media failed", error);
        void logPlayback(`playback "${activeVideo.name}": prepare FAILED`);
        if (!cancelled) {
          setSource({ status: "error", forId, message: String(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeVideo?.id]);

  const sourceForActive =
    activeVideo && source?.forId === activeVideo.id ? source : null;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }
    if (isPlaying) {
      void element.play().catch(logPlayError);
      return;
    }
    element.pause();
  }, [isPlaying, sourceForActive]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || seekToSec === null) {
      return;
    }
    element.currentTime = seekToSec;
    // A seek issued while isPlaying must resume the element. The play-effect
    // only re-fires when isPlaying flips, so a replay-in-place (repeat-one: ended
    // pauses the element, isPlaying stays true) would otherwise stay paused.
    if (isPlaying && element.paused) {
      void element.play().catch(logPlayError);
    }
  }, [seekToSec, isPlaying]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }
    element.volume = volume;
    element.muted = isMuted;
    element.playbackRate = playbackRate;
  }, [volume, isMuted, playbackRate, sourceForActive]);

  return (
    <div
      role="region"
      aria-label="Video viewport"
      onClick={handleClick}
      onDoubleClick={() => void toggleFullscreen()}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
    >
      {!activeVideo && (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Film className="size-10" />
          <p className="text-sm">No video selected</p>
        </div>
      )}
      {activeVideo && !sourceForActive && (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-10 animate-spin" />
          <p className="text-sm">Preparing {activeVideo.name}…</p>
        </div>
      )}
      {activeVideo && sourceForActive?.status === "error" && (
        <div className="flex max-w-md flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
          <Film className="size-10" />
          <p className="text-sm font-medium text-white">Could not play this file</p>
          <p className="text-xs">{sourceForActive.message}</p>
        </div>
      )}
      {activeVideo && sourceForActive?.status === "ready" && (
        <>
          <video
            ref={videoRef}
            src={sourceForActive.url}
            className="h-full w-full"
            style={{
              objectFit: viewportTransform.fitMode,
              transform: `rotate(${viewportTransform.rotationDeg}deg) scale(${viewportTransform.zoom})`,
              transformOrigin: "center",
            }}
            onCanPlay={emitTimelineOnFirstFrame}
            onLoadedData={(event) => {
              if (isPlaying) {
                void event.currentTarget.play().catch(logPlayError);
              }
            }}
            onTimeUpdate={(event) =>
              reportProgress(
                event.currentTarget.currentTime,
                resolveDuration(
                  event.currentTarget.duration,
                  sourceForActive.durationSec,
                ),
              )
            }
            onLoadedMetadata={(event) =>
              reportProgress(
                event.currentTarget.currentTime,
                resolveDuration(
                  event.currentTarget.duration,
                  sourceForActive.durationSec,
                ),
              )
            }
            onEnded={() => reportEnded()}
          />
          {!isFullscreen && titleHiddenForId !== activeVideo.id && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-sm text-white">
              {activeVideo.name}
            </p>
          )}
        </>
      )}
    </div>
  );
}
