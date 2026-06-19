import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";

import { AppProviders } from "@/app/providers";
import { rootRoute } from "@/routes/__root";
import { indexRoute } from "@/routes/index";
import { settingsRoute } from "@/routes/settings";

// No Tauri host under jsdom; the greet IPC wrapper stays wired but is unused by
// the player shell, so a stub keeps the boundary from throwing if ever called.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

function renderApp(initialPath = "/") {
  const routeTree = rootRoute.addChildren([indexRoute, settingsRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}

describe("app shell", () => {
  // AC-001, AC-002, TC-001 — behavior: the player workspace renders at the home route
  it("should render the player workspace at the home route on launch", async () => {
    renderApp("/");

    expect(
      await screen.findByRole("list", { name: /playlist/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /video viewport/i }),
    ).toBeInTheDocument();
  });

  // behavior: the bootstrap demo nav is gone and the palette stays closed at rest
  it("should not render the bootstrap demo nav or an open command palette at the home route", async () => {
    renderApp("/");

    await screen.findByRole("list", { name: /playlist/i });
    expect(
      screen.queryByRole("link", { name: /^home$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // behavior: Mod+K opens the command palette from the home route
  it("should open the command palette when Mod+K is pressed", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByRole("list", { name: /playlist/i });

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("should render a not-found view for an unknown route", async () => {
    renderApp("/this-route-does-not-exist");

    expect(await screen.findByText(/404/i)).toBeInTheDocument();
    expect(screen.getByText(/does not exist/i)).toBeInTheDocument();
  });

  it("should render the settings route content", async () => {
    renderApp("/settings");

    expect(
      await screen.findByRole("heading", { name: /settings/i }),
    ).toBeInTheDocument();
  });
});
