import { createRoute } from "@tanstack/react-router";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { Workspace } from "@/components/workspace/workspace";
import { rootRoute } from "@/routes/__root";

function HomePage() {
  return (
    <WorkspaceProvider initialSortKeys={["title"]} initialSortDirection="asc">
      <Workspace />
    </WorkspaceProvider>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});
