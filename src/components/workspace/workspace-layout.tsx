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
  const isSidebarShown = isSidebarVisible;

  // Sidebar obeys ONLY its own visibility flag. Entering fullscreen auto-hides
  // it (via setFullscreen in the provider), but the toggle still works while
  // fullscreen - never gated, so it can't lock out. The content panel keeps its
  // key so React never remounts <Content/> (and the <video> inside).
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      {isSidebarShown && (
        <ResizablePanel
          key="sidebar"
          id="sidebar"
          defaultSize="20%"
          minSize="12%"
          maxSize="40%"
        >
          <Sidebar />
        </ResizablePanel>
      )}
      {isSidebarShown && <ResizableHandle key="handle" />}
      <ResizablePanel key="content" id="content" defaultSize="80%">
        <Content />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
