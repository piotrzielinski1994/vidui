import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sidebar } from "@/components/workspace/sidebar";
import { Content } from "@/components/workspace/content";
import { useWorkspace } from "@/components/workspace/workspace-context";

export function WorkspaceLayout() {
  const { isSidebarVisible } = useWorkspace();

  if (!isSidebarVisible) {
    return (
      <div className="h-full w-full">
        <Content />
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      <ResizablePanel id="sidebar" defaultSize="20%" minSize="12%" maxSize="40%">
        <Sidebar />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="content" defaultSize="80%">
        <Content />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
