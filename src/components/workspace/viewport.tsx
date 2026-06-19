import { Film } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-context";

export function Viewport() {
  const { activeVideo } = useWorkspace();

  if (!activeVideo) {
    return (
      <div
        role="region"
        aria-label="Video viewport"
        className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black text-muted-foreground"
      >
        <Film className="size-10" />
        <p className="text-sm">No video selected</p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Video viewport"
      className="relative flex h-full w-full items-center justify-center bg-black"
    >
      <div className="flex aspect-video max-h-full max-w-full items-center justify-center bg-neutral-900 text-neutral-600">
        <Film className="size-16" />
      </div>
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm text-white">
        {activeVideo.name}
        <span className="ml-2 text-muted-foreground">
          {activeVideo.resolution}
        </span>
      </p>
    </div>
  );
}
