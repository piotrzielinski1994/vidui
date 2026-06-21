import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type VideoNode } from "@/components/workspace/mock-data";
import { sortVideos, type SortField } from "@/components/workspace/sort-natural";
import { clampRate } from "@/components/workspace/clamp-rate";
import {
  clampSeekTarget,
  FRAME_STEP_SEC,
} from "@/components/workspace/frame-step";
import {
  decideOnEnded,
  nextRepeatMode,
  reconcileOrder,
  shuffleIds,
  type RepeatMode,
} from "@/components/workspace/queue";

type SortDirection = "asc" | "desc";

const clampVolume = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

type WorkspaceContextValue = {
  playlist: VideoNode[];
  selectedNodeId: string | null;
  activeVideoId: string | null;
  activeVideo: VideoNode | null;
  isPlaying: boolean;
  playbackCurrentSec: number;
  playbackDurationSec: number;
  seekToSec: number | null;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  repeatMode: RepeatMode;
  isShuffling: boolean;
  sortKeys: SortField[];
  sortDirection: SortDirection;
  isSidebarVisible: boolean;
  isTransportVisible: boolean;
  selectNode: (id: string) => void;
  loadVideos: (videos: VideoNode[]) => void;
  addVideos: (videos: VideoNode[]) => void;
  togglePlay: () => void;
  nextVideo: () => void;
  prevVideo: () => void;
  seek: (sec: number) => void;
  seekBy: (delta: number) => void;
  stepFrame: (direction: 1 | -1) => void;
  setVolume: (value: number) => void;
  changeVolume: (delta: number) => void;
  toggleMute: () => void;
  changeRate: (delta: number) => void;
  reportProgress: (currentSec: number, durationSec: number) => void;
  reportEnded: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setFullscreen: (value: boolean) => void;
  toggleSortKey: (field: SortField) => void;
  toggleSortDirection: () => void;
  toggleSidebar: () => void;
  toggleTransport: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type WorkspaceProviderProps = {
  children: ReactNode;
  videos?: VideoNode[];
  initialActiveVideoId?: string;
  initialSortKeys?: SortField[];
  initialSortDirection?: SortDirection;
  initialVolume?: number;
  initialMuted?: boolean;
  initialPlaybackRate?: number;
  initialSidebarHidden?: boolean;
  initialTransportHidden?: boolean;
  onVolumeChange?: (volume: number) => void;
  onMutedChange?: (isMuted: boolean) => void;
  onPlaybackRateChange?: (rate: number) => void;
  onSidebarHiddenChange?: (hidden: boolean) => void;
  onTransportHiddenChange?: (hidden: boolean) => void;
  onSortDirectionChange?: (direction: SortDirection) => void;
  rng?: () => number;
};

export function WorkspaceProvider({
  children,
  videos = [],
  initialActiveVideoId,
  initialSortKeys = [],
  initialSortDirection = "asc",
  initialVolume = 1,
  initialMuted = false,
  initialPlaybackRate = 1,
  initialSidebarHidden = false,
  initialTransportHidden = false,
  onVolumeChange,
  onMutedChange,
  onPlaybackRateChange,
  onSidebarHiddenChange,
  onTransportHiddenChange,
  onSortDirectionChange,
  rng = Math.random,
}: WorkspaceProviderProps) {
  const [sourceVideos, setSourceVideos] = useState<VideoNode[]>(videos);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialActiveVideoId ?? null,
  );
  const [activeVideoId, setActiveVideoId] = useState<string | null>(
    initialActiveVideoId ?? null,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackCurrentSec, setPlaybackCurrentSec] = useState(0);
  const [playbackDurationSec, setPlaybackDurationSec] = useState(0);
  const [seekToSec, setSeekToSec] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(initialVolume);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [playbackRate, setPlaybackRate] = useState(initialPlaybackRate);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [isShuffling, setIsShuffling] = useState(false);
  const [shuffleOrder, setShuffleOrder] = useState<string[]>([]);
  const [sortKeys, setSortKeys] = useState<SortField[]>(initialSortKeys);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(initialSortDirection);
  const [isSidebarVisible, setIsSidebarVisible] = useState(!initialSidebarHidden);
  const [isTransportVisible, setIsTransportVisible] = useState(
    !initialTransportHidden,
  );
  const wasFullscreen = useRef(false);
  const initialChrome = {
    sidebar: !initialSidebarHidden,
    transport: !initialTransportHidden,
  };
  const chromeRef = useRef(initialChrome);
  const preFullscreenChrome = useRef(initialChrome);
  const sourceVideosRef = useRef(sourceVideos);
  const activeVideoIdRef = useRef(activeVideoId);

  // Mirror durable state into refs so the reference-stable verbs below
  // (addVideos) can read CURRENT values without going stale - which lets the
  // drop-subscription effect keep one stable handler instead of re-subscribing.
  useEffect(() => {
    sourceVideosRef.current = sourceVideos;
    activeVideoIdRef.current = activeVideoId;
  }, [sourceVideos, activeVideoId]);

  // Stable identity ([]-deps). Activates a video and starts playback from 0.
  const activateVideo = useCallback((id: string) => {
    setActiveVideoId(id);
    setSelectedNodeId(id);
    setIsPlaying(true);
    setPlaybackCurrentSec(0);
    setPlaybackDurationSec(0);
    setSeekToSec(null);
  }, []);

  // Stable identity so the Workspace drop effect subscribes once. Appends the
  // imported videos, deduping by id against the current list; activates the
  // first NEW one only when nothing is active yet (empty-playlist parity).
  const addVideos = useCallback(
    (incoming: VideoNode[]) => {
      const current = sourceVideosRef.current;
      const fresh = incoming.filter(
        (video) => !current.some((existing) => existing.id === video.id),
      );
      if (fresh.length === 0) {
        return;
      }
      setSourceVideos((videos) => [...videos, ...fresh]);
      if (activeVideoIdRef.current === null) {
        activateVideo(fresh[0].id);
      }
    },
    [activateVideo],
  );

  // Mirror the live visibility into a ref so setFullscreen (stable, []-deps) can
  // read the CURRENT windowed values without going stale.
  useEffect(() => {
    chromeRef.current = {
      sidebar: isSidebarVisible,
      transport: isTransportVisible,
    };
  }, [isSidebarVisible, isTransportVisible]);

  // Stable identity (the Workspace subscribes with this in a dep array, so it
  // must not change every render). On a real fullscreen TRANSITION it hides
  // chrome on enter (saving the windowed visibility first) and restores that
  // saved state on exit - so a sidebar hidden before going fullscreen stays
  // hidden after. Between transitions the panel toggles work freely.
  const setFullscreen = useCallback((value: boolean) => {
    setIsFullscreen(value);
    if (wasFullscreen.current === value) {
      return;
    }
    wasFullscreen.current = value;
    if (value) {
      preFullscreenChrome.current = chromeRef.current;
      setIsSidebarVisible(false);
      setIsTransportVisible(false);
      return;
    }
    setIsSidebarVisible(preFullscreenChrome.current.sidebar);
    setIsTransportVisible(preFullscreenChrome.current.transport);
  }, []);

  const playlist = useMemo(
    () => sortVideos(sourceVideos, sortKeys, sortDirection),
    [sourceVideos, sortKeys, sortDirection],
  );

  // The order Next/Prev/auto-advance walk: the live sorted ids, or - when
  // shuffling - the frozen shuffle order reconciled against the current ids
  // (so appended videos slot in at the end and removed ones drop out).
  const effectiveOrder = useMemo(() => {
    const playlistIds = playlist.map((video) => video.id);
    return isShuffling ? reconcileOrder(shuffleOrder, playlistIds) : playlistIds;
  }, [playlist, isShuffling, shuffleOrder]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const activate = activateVideo;

    const stepVideo = (delta: number) => {
      if (effectiveOrder.length === 0 || activeVideoId === null) {
        return;
      }
      const index = effectiveOrder.indexOf(activeVideoId);
      if (index === -1) {
        return;
      }
      const nextId =
        effectiveOrder[
          (index + delta + effectiveOrder.length) % effectiveOrder.length
        ];
      activate(nextId);
    };

    return {
      playlist,
      selectedNodeId,
      activeVideoId,
      activeVideo:
        activeVideoId !== null
          ? (playlist.find((video) => video.id === activeVideoId) ?? null)
          : null,
      isPlaying,
      playbackCurrentSec,
      playbackDurationSec,
      seekToSec,
      volume,
      isMuted,
      playbackRate,
      isFullscreen,
      repeatMode,
      isShuffling,
      sortKeys,
      sortDirection,
      isSidebarVisible,
      isTransportVisible,
      selectNode: (id) => activate(id),
      loadVideos: (next) => {
        setSourceVideos(next);
        if (next.length === 0) {
          setActiveVideoId(null);
          setSelectedNodeId(null);
          setIsPlaying(false);
          setPlaybackCurrentSec(0);
          setPlaybackDurationSec(0);
          return;
        }
        activate(next[0].id);
      },
      addVideos,
      togglePlay: () => setIsPlaying((playing) => !playing),
      nextVideo: () => stepVideo(1),
      prevVideo: () => stepVideo(-1),
      seek: (sec) => {
        setPlaybackCurrentSec(sec);
        setSeekToSec(sec);
      },
      seekBy: (delta) => {
        if (activeVideoId === null) {
          return;
        }
        const clamped = clampSeekTarget(
          playbackCurrentSec,
          delta,
          playbackDurationSec,
        );
        setPlaybackCurrentSec(clamped);
        setSeekToSec(clamped);
      },
      stepFrame: (direction) => {
        if (activeVideoId === null) {
          return;
        }
        setIsPlaying(false);
        const clamped = clampSeekTarget(
          playbackCurrentSec,
          direction * FRAME_STEP_SEC,
          playbackDurationSec,
        );
        setPlaybackCurrentSec(clamped);
        setSeekToSec(clamped);
      },
      setVolume: (next) => {
        if (activeVideoId === null) {
          return;
        }
        const clamped = clampVolume(next);
        setVolumeState(clamped);
        onVolumeChange?.(clamped);
      },
      changeVolume: (delta) => {
        if (activeVideoId === null) {
          return;
        }
        const clamped = clampVolume(volume + delta);
        setVolumeState(clamped);
        onVolumeChange?.(clamped);
      },
      toggleMute: () => {
        if (activeVideoId === null) {
          return;
        }
        const next = !isMuted;
        setIsMuted(next);
        onMutedChange?.(next);
      },
      changeRate: (delta) => {
        if (activeVideoId === null) {
          return;
        }
        const clamped = clampRate(playbackRate + delta);
        setPlaybackRate(clamped);
        onPlaybackRateChange?.(clamped);
      },
      reportProgress: (currentSec, durationSec) => {
        setPlaybackCurrentSec(currentSec);
        setPlaybackDurationSec(durationSec);
        setSeekToSec(null);
      },
      reportEnded: () => {
        if (activeVideoId === null) {
          return;
        }
        const decision = decideOnEnded(
          effectiveOrder,
          activeVideoId,
          repeatMode,
        );
        if (decision.kind === "advance") {
          activate(decision.id);
          return;
        }
        if (decision.kind === "replay") {
          setPlaybackCurrentSec(0);
          setSeekToSec(0);
          setIsPlaying(true);
          return;
        }
        setIsPlaying(false);
      },
      cycleRepeat: () => {
        if (activeVideoId === null) {
          return;
        }
        setRepeatMode(nextRepeatMode);
      },
      toggleShuffle: () => {
        if (activeVideoId === null) {
          return;
        }
        setIsShuffling((shuffling) => {
          if (!shuffling) {
            setShuffleOrder(shuffleIds(playlist.map((v) => v.id), rng));
          }
          return !shuffling;
        });
      },
      setFullscreen,
      toggleSortKey: (field) =>
        setSortKeys((current) =>
          current.includes(field)
            ? current.filter((key) => key !== field)
            : [...current, field],
        ),
      toggleSortDirection: () => {
        const next = sortDirection === "asc" ? "desc" : "asc";
        setSortDirection(next);
        onSortDirectionChange?.(next);
      },
      toggleSidebar: () => {
        const next = !isSidebarVisible;
        setIsSidebarVisible(next);
        onSidebarHiddenChange?.(!next);
      },
      toggleTransport: () => {
        const next = !isTransportVisible;
        setIsTransportVisible(next);
        onTransportHiddenChange?.(!next);
      },
    };
  }, [
    playlist,
    effectiveOrder,
    selectedNodeId,
    activeVideoId,
    isPlaying,
    playbackCurrentSec,
    playbackDurationSec,
    seekToSec,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    repeatMode,
    isShuffling,
    rng,
    setFullscreen,
    activateVideo,
    addVideos,
    sortKeys,
    sortDirection,
    isSidebarVisible,
    isTransportVisible,
    onVolumeChange,
    onMutedChange,
    onPlaybackRateChange,
    onSidebarHiddenChange,
    onTransportHiddenChange,
    onSortDirectionChange,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return value;
}
