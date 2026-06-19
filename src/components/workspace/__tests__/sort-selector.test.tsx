import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspace/workspace-context";
import { SortSelector } from "@/components/workspace/sort-selector";
import { fixtureVideos } from "./fixtures";

// A sibling probe surfaces context sort state so SortSelector's effect on
// `toggleSortKey` / `toggleSortDirection` is observable without the full Sidebar.
function SortProbe() {
  const ws = useWorkspace();
  return (
    <div>
      <output aria-label="keys">{ws.sortKeys.join(",") || "none"}</output>
      <output aria-label="direction">{ws.sortDirection}</output>
    </div>
  );
}

const renderSelector = (
  props: Omit<React.ComponentProps<typeof WorkspaceProvider>, "children"> = {},
) =>
  render(
    <WorkspaceProvider videos={fixtureVideos} {...props}>
      <SortSelector />
      <SortProbe />
    </WorkspaceProvider>,
  );

const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /sort/i }));

describe("SortSelector", () => {
  // behavior: the combobox trigger renders as a button named /sort/i (AC-010)
  it("should render a sort combobox trigger button if mounted", () => {
    renderSelector();

    expect(screen.getByRole("button", { name: /sort/i })).toBeInTheDocument();
  });

  // behavior: clicking the trigger opens the menu of the field checkbox items (AC-010)
  it("should open a menu of the title and type checkbox items if the trigger is clicked", async () => {
    const user = userEvent.setup();
    renderSelector();

    await openMenu(user);

    const items = screen.getAllByRole("menuitemcheckbox");
    expect(items).toHaveLength(2);
    ["title", "type"].forEach((field) => {
      expect(
        screen.getByRole("menuitemcheckbox", { name: new RegExp(field, "i") }),
      ).toBeInTheDocument();
    });
  });

  // side-effect-contract: selecting a field calls toggleSortKey, adding it to sortKeys (AC-010)
  it("should add a field to sortKeys if its checkbox item is selected", async () => {
    const user = userEvent.setup();
    renderSelector();

    expect(screen.getByLabelText("keys")).toHaveTextContent("none");

    await openMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /type/i }));

    expect(screen.getByLabelText("keys")).toHaveTextContent("type");
  });

  // side-effect-contract: selection order becomes the chain order (first = primary) (AC-010)
  it("should record fields in selection order if two fields are selected in turn", async () => {
    const user = userEvent.setup();
    renderSelector();

    await openMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /type/i }));

    await openMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /title/i }));

    expect(screen.getByLabelText("keys")).toHaveTextContent("type,title");
  });

  // side-effect-contract: re-selecting a field removes it from sortKeys (toggle off) (AC-010)
  it("should remove a field from sortKeys if its checkbox item is selected twice", async () => {
    const user = userEvent.setup();
    renderSelector({ initialSortKeys: ["title"] });

    await openMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /title/i }));

    expect(screen.getByLabelText("keys")).toHaveTextContent("none");
  });

  // behavior: a checked item reflects membership in sortKeys (AC-010)
  it("should mark a field checked if it is a member of sortKeys", async () => {
    const user = userEvent.setup();
    renderSelector({ initialSortKeys: ["type"] });

    await openMenu(user);

    expect(
      screen.getByRole("menuitemcheckbox", { name: /type/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemcheckbox", { name: /title/i }),
    ).toHaveAttribute("aria-checked", "false");
  });

  // side-effect-contract: a direction toggle flips sortDirection asc <-> desc (AC-010)
  it("should flip sortDirection if the direction control is toggled", async () => {
    const user = userEvent.setup();
    renderSelector({ initialSortDirection: "asc" });

    expect(screen.getByLabelText("direction")).toHaveTextContent("asc");

    await user.click(
      screen.getByRole("button", { name: /ascending|descending|direction/i }),
    );

    expect(screen.getByLabelText("direction")).toHaveTextContent("desc");
  });
});
