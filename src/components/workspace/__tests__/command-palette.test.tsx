import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatForDisplay } from "@tanstack/hotkeys";

import {
  CommandPalette,
  type PaletteCommand,
} from "@/components/workspace/command-palette";
import type { ShortcutAction } from "@/lib/shortcuts/registry";

const playAction: ShortcutAction = {
  id: "toggle-play",
  name: "Play / pause",
  description: "Toggle playback",
  defaultHotkey: "Space",
};

const nextAction: ShortcutAction = {
  id: "next-video",
  name: "Next video",
  description: "Advance to the next video",
  defaultHotkey: "Mod+Right",
};

const buildCommand = (
  action: ShortcutAction,
  run = vi.fn(),
): PaletteCommand => ({
  action,
  binding: action.defaultHotkey,
  run,
});

const noop = () => {};

describe("CommandPalette", () => {
  // behavior: one row per command, each showing the action name + its formatted shortcut (AC-003)
  it("should render a row per command with its name and formatted shortcut if open", () => {
    render(
      <CommandPalette
        open
        onOpenChange={noop}
        commands={[buildCommand(playAction), buildCommand(nextAction)]}
      />,
    );

    const playRow = screen.getByRole("option", { name: /play \/ pause/i });
    expect(
      within(playRow).getByText(formatForDisplay("Space")),
    ).toBeInTheDocument();

    const nextRow = screen.getByRole("option", { name: /next video/i });
    expect(
      within(nextRow).getByText(formatForDisplay("Mod+Right")),
    ).toBeInTheDocument();
  });

  // behavior: typing filters the list down to matching action names (AC-004)
  it("should narrow the list to matching commands if text is typed into the search input", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        open
        onOpenChange={noop}
        commands={[buildCommand(playAction), buildCommand(nextAction)]}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/type a command/i),
      "next",
    );

    expect(
      screen.getByRole("option", { name: /next video/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /play \/ pause/i }),
    ).not.toBeInTheDocument();
  });

  // behavior: gibberish matches nothing -> the empty state is shown (AC-004 / E-3)
  it("should show 'No matching commands' if the typed text matches no command", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        open
        onOpenChange={noop}
        commands={[buildCommand(playAction), buildCommand(nextAction)]}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/type a command/i),
      "frobnicate",
    );

    expect(screen.getByText(/no matching commands/i)).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  // side-effect-contract: Enter on a row runs that command's handler exactly once then closes (AC-005 / E-5)
  it("should run the selected command once and close if Enter is pressed on a row", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        commands={[buildCommand(playAction, run)]}
      />,
    );

    // the single row is auto-highlighted by cmdk; Enter selects it
    await user.keyboard("{Enter}");

    expect(run).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // side-effect-contract: clicking a row runs its handler once then closes (AC-005 / E-5)
  it("should run the clicked command once and close if a row is clicked", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        commands={[buildCommand(playAction, run)]}
      />,
    );

    await user.click(screen.getByRole("option", { name: /play \/ pause/i }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
