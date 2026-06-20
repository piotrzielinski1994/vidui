import { useEffect, useRef, useState } from "react";
import { Film, Loader2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { prepareMediaUrl, toggleFullscreen } from "@/lib/tauri";

function logPlayError(error: unknown) {
  console.error("video play() rejected", error);
}

type SourceState =
  | { status: "ready"; forId: string; url: string }
  | { status: "error"; forId: string; message: string };

export function Viewport() {
  const {
    activeVideo,
    isPlaying,
    seekToSec,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    togglePlay,
    reportProgress,
    reportEnded,
  } = useWorkspace();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<SourceState | null>(null);

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
    prepareMediaUrl(activeVideo.path)
      .then((url) => {
        if (!cancelled) {
          setSource({ status: "ready", forId, url });
        }
      })
      .catch((error) => {
        console.error("prepare_media failed", error);
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
      className="relative flex h-full w-full items-center justify-center bg-black"
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
            className="max-h-full max-w-full"
            onLoadedData={(event) => {
              if (isPlaying) {
                void event.currentTarget.play().catch(logPlayError);
              }
            }}
            onTimeUpdate={(event) =>
              reportProgress(
                event.currentTarget.currentTime,
                event.currentTarget.duration || 0,
              )
            }
            onLoadedMetadata={(event) =>
              reportProgress(
                event.currentTarget.currentTime,
                event.currentTarget.duration || 0,
              )
            }
            onEnded={() => reportEnded()}
          />
          {!isFullscreen && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-sm text-white">
              {activeVideo.name}
            </p>
          )}
        </>
      )}
    </div>
  );
}
