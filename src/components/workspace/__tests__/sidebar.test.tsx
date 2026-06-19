import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { Sidebar } from "@/components/workspace/sidebar";
import {
  fixtureVideos,
  compositeFixture,
  compositeTitleAscNames,
  compositeTypeTitleAscNames,
} from "./fixtures";

const prefixOf = (name: string) =>
  Number.parseInt(name.match(/\d+/)?.[0] ?? "", 10);

const renderSidebar = (
  props: Omit<React.ComponentProps<typeof WorkspaceProvider>, "children"> = {},
) =>
  render(
    <WorkspaceProvider videos={fixtureVideos} {...props}>
      <Sidebar />
    </WorkspaceProvider>,
  );

const listItemNames = () =>
  within(screen.getByRole("list", { name: /playlist/i }))
    .getAllByRole("listitem")
    .map((li) => li.textContent ?? "");

const numericPrefixes = () =>
  listItemNames().map((text) =>
    Number.parseInt(text.match(/\d+/)?.[0] ?? "", 10),
  );

// The Radix dropdown-menu closes when a checkbox item is selected, so the menu
// must be re-opened before selecting the next field.
const openSortMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /sort/i }));

describe("Sidebar", () => {
  // behavior: the header no longer renders a literal "Playlist" title (AC-010)
  it("should not render a 'Playlist' text title in the header if mounted", () => {
    renderSidebar();

    expect(screen.queryByText("Playlist")).not.toBeInTheDocument();
  });

  // behavior: the playlist list still exists (its aria-label may match /playlist/i) (AC-003)
  it("should still render the playlist list below the header if mounted", () => {
    renderSidebar();

    expect(
      screen.getByRole("list", { name: /playlist/i }),
    ).toBeInTheDocument();
  });

  // behavior: the header carries a sort combobox trigger named /sort/i (AC-010)
  it("should render a sort combobox trigger in the header if mounted", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: /sort/i })).toBeInTheDocument();
  });

  // behavior: clicking the trigger opens a menu of the sort-field checkbox items (AC-010)
  it("should reveal title and type checkbox items if the sort trigger is clicked", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await openSortMenu(user);

    expect(
      screen.getByRole("menuitemcheckbox", { name: /title/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /type/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(2);
  });

  // behavior: open order before any field is selected (AC-003)
  it("should render the playlist in open order if no sort field is selected", () => {
    renderSidebar();

    expect(numericPrefixes()).toEqual([1, 21, 3, 9, 12]);
  });

  // behavior: selecting Title -> natural ascending (3 before 21), not lexical (AC-010/TC-005)
  it("should reorder the list to natural ascending if the Title field is selected", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await openSortMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /title/i }));

    expect(numericPrefixes()).toEqual([1, 3, 9, 12, 21]);
  });

  // behavior: a selected field reports itself checked when the menu is re-opened (AC-010)
  it("should mark the Title field checked if it has been selected", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await openSortMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /title/i }));

    await openSortMenu(user);
    expect(
      screen.getByRole("menuitemcheckbox", { name: /title/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  // behavior: selecting Title then Type composes [title, type]; with shared formats the order changes (AC-010)
  it("should reorder by the composite chain if Type then Title are selected in order", async () => {
    const user = userEvent.setup();
    renderSidebar({ videos: compositeFixture });

    await openSortMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /type/i }));

    await openSortMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /title/i }));

    // assert by numeric-prefix sequence: composite [type,title] = 2,10,1,3,21
    expect(numericPrefixes()).toEqual(
      compositeTypeTitleAscNames.map(prefixOf),
    );
  });

  // behavior: a title-only selection differs from the composite order (proves selection-order chaining) (AC-010)
  it("should yield a title-only order distinct from the composite order if only Title is selected", async () => {
    const user = userEvent.setup();
    renderSidebar({ videos: compositeFixture });

    await openSortMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /title/i }));

    // title-only = 1,2,3,10,21 - distinct from composite 2,10,1,3,21
    expect(numericPrefixes()).toEqual(compositeTitleAscNames.map(prefixOf));
    expect(numericPrefixes()).not.toEqual(
      compositeTypeTitleAscNames.map(prefixOf),
    );
  });

  // behavior: a direction control flips a sorted list asc <-> desc (AC-010/TC-005)
  it("should flip the sorted order if the direction control is toggled", async () => {
    const user = userEvent.setup();
    renderSidebar({ initialSortKeys: ["title"] });

    expect(numericPrefixes()).toEqual([1, 3, 9, 12, 21]);

    await user.click(
      screen.getByRole("button", { name: /ascending|descending|direction/i }),
    );

    expect(numericPrefixes()).toEqual([21, 12, 9, 3, 1]);
  });

  // behavior: the active video is preserved across a sort selection (E-6)
  it("should keep the seeded active video active if a sort field is selected", async () => {
    const user = userEvent.setup();
    renderSidebar({ initialActiveVideoId: "v-9" });

    const list = () => screen.getByRole("list", { name: /playlist/i });
    expect(
      within(list()).getByRole("listitem", { name: /9 - Interlude/i }),
    ).toHaveAttribute("aria-selected", "true");

    await openSortMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /title/i }));

    expect(
      within(list()).getByRole("listitem", { name: /9 - Interlude/i }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
