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
  setVolume: (value: number) => void;
  changeVolume: (delta: number) => void;
  toggleMute: () => void;
  changeRate: (delta: number) => void;
  reportProgress: (currentSec: number, durationSec: number) => void;
  reportEnded: () => void;
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
};

export function WorkspaceProvider({
  children,
  videos = [],
  initialActiveVideoId,
  initialSortKeys = [],
  initialSortDirection = "asc",
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
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sortKeys, setSortKeys] = useState<SortField[]>(initialSortKeys);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(initialSortDirection);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isTransportVisible, setIsTransportVisible] = useState(true);
  const wasFullscreen = useRef(false);
  const chromeRef = useRef({ sidebar: true, transport: true });
  const preFullscreenChrome = useRef({ sidebar: true, transport: true });
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

  const value = useMemo<WorkspaceContextValue>(() => {
    const activate = activateVideo;

    const stepVideo = (delta: number) => {
      if (playlist.length === 0 || activeVideoId === null) {
        return;
      }
      const index = playlist.findIndex((video) => video.id === activeVideoId);
      if (index === -1) {
        return;
      }
      const next = playlist[(index + delta + playlist.length) % playlist.length];
      activate(next.id);
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
        const target = playbackCurrentSec + delta;
        const lowerClamped = Math.max(0, target);
        const clamped =
          playbackDurationSec > 0
            ? Math.min(playbackDurationSec, lowerClamped)
            : lowerClamped;
        setPlaybackCurrentSec(clamped);
        setSeekToSec(clamped);
      },
      setVolume: (next) => {
        if (activeVideoId === null) {
          return;
        }
        setVolumeState(clampVolume(next));
      },
      changeVolume: (delta) => {
        if (activeVideoId === null) {
          return;
        }
        setVolumeState((current) => clampVolume(current + delta));
      },
      toggleMute: () => {
        if (activeVideoId === null) {
          return;
        }
        setIsMuted((muted) => !muted);
      },
      changeRate: (delta) => {
        if (activeVideoId === null) {
          return;
        }
        setPlaybackRate((current) => clampRate(current + delta));
      },
      reportProgress: (currentSec, durationSec) => {
        setPlaybackCurrentSec(currentSec);
        setPlaybackDurationSec(durationSec);
        setSeekToSec(null);
      },
      reportEnded: () => setIsPlaying(false),
      setFullscreen,
      toggleSortKey: (field) =>
        setSortKeys((current) =>
          current.includes(field)
            ? current.filter((key) => key !== field)
            : [...current, field],
        ),
      toggleSortDirection: () =>
        setSortDirection((current) => (current === "asc" ? "desc" : "asc")),
      toggleSidebar: () => setIsSidebarVisible((visible) => !visible),
      toggleTransport: () => setIsTransportVisible((visible) => !visible),
    };
  }, [
    playlist,
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
    setFullscreen,
    activateVideo,
    addVideos,
    sortKeys,
    sortDirection,
    isSidebarVisible,
    isTransportVisible,
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
