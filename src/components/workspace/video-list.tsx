import { cn } from "@/lib/utils";
import { FORMAT_COLOR } from "@/components/workspace/format-color";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { ScrollArea } from "@/components/ui/scroll-area";

export function VideoList() {
  const { playlist, selectedNodeId, selectNode } = useWorkspace();

  return (
    <ScrollArea className="flex-1">
      <ul role="list" aria-label="Playlist">
        {playlist.map((video) => (
          <li
            key={video.id}
            role="listitem"
            aria-selected={selectedNodeId === video.id}
            aria-label={video.name}
            tabIndex={0}
            onClick={() => selectNode(video.id)}
            className={cn(
              "flex cursor-pointer items-center gap-2 px-3 py-1 text-[13px] hover:bg-accent",
              selectedNodeId === video.id && "bg-accent",
            )}
          >
            <span className="truncate">{video.name}</span>
            <span
              className={cn(
                "ml-auto shrink-0 font-mono text-[11px] font-semibold",
                FORMAT_COLOR[video.format],
              )}
            >
              {video.format}
            </span>
          </li>
        ))}
      </ul>
      {playlist.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
          (no videos)
        </p>
      )}
    </ScrollArea>
  );
}
