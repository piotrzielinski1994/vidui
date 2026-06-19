import { Viewport } from "@/components/workspace/viewport";
import { TransportBar } from "@/components/workspace/transport-bar";
import { useWorkspace } from "@/components/workspace/workspace-context";

export function Content() {
  const { isTransportVisible } = useWorkspace();

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <Viewport />
      </div>
      {isTransportVisible && <TransportBar />}
    </div>
  );
}
