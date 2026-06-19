import { VideoList } from "@/components/workspace/video-list";
import { SortSelector } from "@/components/workspace/sort-selector";

export function Sidebar() {
  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="flex h-9 shrink-0 items-center border-b text-sm font-semibold">
        <SortSelector />
      </div>
      <VideoList />
    </div>
  );
}
