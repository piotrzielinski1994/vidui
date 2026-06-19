import { Viewport } from "@/components/workspace/viewport";
import { TransportBar } from "@/components/workspace/transport-bar";

export function Content() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <Viewport />
      </div>
      <TransportBar />
    </div>
  );
}
