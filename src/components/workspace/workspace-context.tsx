import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { mockVideos, type VideoNode } from "@/components/workspace/mock-data";
import { sortVideos, type SortField } from "@/components/workspace/sort-natural";

type SortDirection = "asc" | "desc";

type WorkspaceContextValue = {
  playlist: VideoNode[];
  selectedNodeId: string | null;
  activeVideoId: string | null;
  activeVideo: VideoNode | null;
  isPlaying: boolean;
  sortKeys: SortField[];
  sortDirection: SortDirection;
  selectNode: (id: string) => void;
  togglePlay: () => void;
  nextVideo: () => void;
  prevVideo: () => void;
  toggleSortKey: (field: SortField) => void;
  toggleSortDirection: () => void;
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
  videos = mockVideos,
  initialActiveVideoId,
  initialSortKeys = [],
  initialSortDirection = "asc",
}: WorkspaceProviderProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialActiveVideoId ?? null,
  );
  const [activeVideoId, setActiveVideoId] = useState<string | null>(
    initialActiveVideoId ?? null,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [sortKeys, setSortKeys] = useState<SortField[]>(initialSortKeys);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(initialSortDirection);

  const playlist = useMemo(
    () => sortVideos(videos, sortKeys, sortDirection),
    [videos, sortKeys, sortDirection],
  );

  const value = useMemo<WorkspaceContextValue>(() => {
    const stepVideo = (delta: number) => {
      if (playlist.length === 0 || activeVideoId === null) {
        return;
      }
      const index = playlist.findIndex((video) => video.id === activeVideoId);
      if (index === -1) {
        return;
      }
      const next = playlist[(index + delta + playlist.length) % playlist.length];
      setActiveVideoId(next.id);
      setSelectedNodeId(next.id);
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
      sortKeys,
      sortDirection,
      selectNode: (id) => {
        setSelectedNodeId(id);
        setActiveVideoId(id);
      },
      togglePlay: () => setIsPlaying((playing) => !playing),
      nextVideo: () => stepVideo(1),
      prevVideo: () => stepVideo(-1),
      toggleSortKey: (field) =>
        setSortKeys((current) =>
          current.includes(field)
            ? current.filter((key) => key !== field)
            : [...current, field],
        ),
      toggleSortDirection: () =>
        setSortDirection((current) => (current === "asc" ? "desc" : "asc")),
    };
  }, [playlist, selectedNodeId, activeVideoId, isPlaying, sortKeys, sortDirection]);

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
