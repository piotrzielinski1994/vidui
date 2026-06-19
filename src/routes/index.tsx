import { createRoute } from "@tanstack/react-router";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { rootRoute } from "@/routes/__root";

function HomePage() {
  return (
    <WorkspaceProvider
      initialActiveVideoId="v-1"
      initialSortKeys={["title"]}
      initialSortDirection="asc"
    >
      <WorkspaceLayout />
    </WorkspaceProvider>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});
