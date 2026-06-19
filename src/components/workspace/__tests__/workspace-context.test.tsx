import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/workspace/workspace-context";
import {
  fixtureVideos,
  singleVideoList,
  compositeFixture,
  compositeTypeTitleAscNames,
} from "./fixtures";

// Thin probe that surfaces the context state as observable DOM, mirroring the
// requi render-under-provider convention (no SUT mocking). Sort is now a
// composite chain: `sortKeys` (selection-order priority) + `sortDirection`.
function Probe() {
  const ws = useWorkspace();
  return (
    <div>
      <ol aria-label="probe-playlist">
        {ws.playlist.map((v) => (
          <li key={v.id}>{v.name}</li>
        ))}
      </ol>
      <output aria-label="active">{ws.activeVideo?.name ?? "none"}</output>
      <output aria-label="active-id">{ws.activeVideoId ?? "none"}</output>
      <output aria-label="selected-id">{ws.selectedNodeId ?? "none"}</output>
      <output aria-label="playing">{String(ws.isPlaying)}</output>
      <output aria-label="direction">{ws.sortDirection}</output>
      <output aria-label="keys">{ws.sortKeys.join(",") || "none"}</output>
      <output aria-label="sidebar-visible">
        {String(ws.isSidebarVisible)}
      </output>
      <output aria-label="transport-visible">
        {String(ws.isTransportVisible)}
      </output>
      <button onClick={() => ws.toggleSidebar()}>do-toggle-sidebar</button>
      <button onClick={() => ws.toggleTransport()}>do-toggle-transport</button>
      <button onClick={() => ws.toggleSortKey("title")}>key-title</button>
      <button onClick={() => ws.toggleSortKey("type")}>key-type</button>
      <button onClick={() => ws.toggleSortDirection()}>flip-dir</button>
      <button onClick={() => ws.nextVideo()}>do-next</button>
      <button onClick={() => ws.prevVideo()}>do-prev</button>
      <button onClick={() => ws.togglePlay()}>do-play</button>
      <button onClick={() => ws.selectNode("v-9")}>select-9</button>
    </div>
  );
}

const playlistNames = () =>
  within(screen.getByRole("list", { name: "probe-playlist" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

const renderProbe = (
  props: Omit<React.ComponentProps<typeof WorkspaceProvider>, "children">,
) =>
  render(
    <WorkspaceProvider {...props}>
      <Probe />
    </WorkspaceProvider>,
  );

describe("workspace context", () => {
  // behavior: initial playlist is open order with empty sortKeys (spec §4 defaults)
  it("should expose the playlist in open order with empty sortKeys if just mounted", () => {
    renderProbe({ videos: fixtureVideos });

    expect(playlistNames()).toEqual([
      "1 - Opening",
      "21 - Finale",
      "3 - Intro",
      "9 - Interlude",
      "12 - Bridge",
    ]);
    expect(screen.getByLabelText("keys")).toHaveTextContent("none");
    expect(screen.getByLabelText("direction")).toHaveTextContent("asc");
  });

  // behavior: seeding initialSortKeys orders the playlist at launch (home route state)
  it("should expose the playlist already natural-sorted if initialSortKeys is [title]", () => {
    renderProbe({ videos: fixtureVideos, initialSortKeys: ["title"] });

    expect(screen.getByLabelText("keys")).toHaveTextContent("title");
    expect(playlistNames()).toEqual([
      "1 - Opening",
      "3 - Intro",
      "9 - Interlude",
      "12 - Bridge",
      "21 - Finale",
    ]);
  });

  // side-effect-contract: toggleSortKey("title") adds the key and reorders to natural asc (AC-010)
  it("should add the title key and reorder to natural asc if toggleSortKey('title') is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    await user.click(screen.getByRole("button", { name: "key-title" }));

    expect(screen.getByLabelText("keys")).toHaveTextContent("title");
    expect(playlistNames()).toEqual([
      "1 - Opening",
      "3 - Intro",
      "9 - Interlude",
      "12 - Bridge",
      "21 - Finale",
    ]);
  });

  // side-effect-contract: toggling the same key twice removes it -> back to open order
  it("should remove the title key and revert to open order if toggleSortKey('title') is called twice", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    const keyTitle = screen.getByRole("button", { name: "key-title" });
    await user.click(keyTitle);
    await user.click(keyTitle);

    expect(screen.getByLabelText("keys")).toHaveTextContent("none");
    expect(playlistNames()).toEqual([
      "1 - Opening",
      "21 - Finale",
      "3 - Intro",
      "9 - Interlude",
      "12 - Bridge",
    ]);
  });

  // side-effect-contract: selection order = priority; type then title => [type, title] chain (AC-010)
  it("should compose a [type, title] chain in selection order if type is toggled then title", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: compositeFixture });

    await user.click(screen.getByRole("button", { name: "key-type" }));
    await user.click(screen.getByRole("button", { name: "key-title" }));

    expect(screen.getByLabelText("keys")).toHaveTextContent("type,title");
    expect(playlistNames()).toEqual(compositeTypeTitleAscNames);
  });

  // side-effect-contract: toggleSortDirection flips asc <-> desc and reverses the order (AC-010)
  it("should reverse the sorted playlist if toggleSortDirection flips asc to desc", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialSortKeys: ["title"] });

    expect(screen.getByLabelText("direction")).toHaveTextContent("asc");

    await user.click(screen.getByRole("button", { name: "flip-dir" }));

    expect(screen.getByLabelText("direction")).toHaveTextContent("desc");
    expect(playlistNames()).toEqual([
      "21 - Finale",
      "12 - Bridge",
      "9 - Interlude",
      "3 - Intro",
      "1 - Opening",
    ]);
  });

  // behavior: selectNode highlights AND activates - selection and active coincide
  it("should set both selected and active to the same node if a node is selected", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    await user.click(screen.getByRole("button", { name: "select-9" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("v-9");
    expect(screen.getByLabelText("selected-id")).toHaveTextContent("v-9");
    expect(screen.getByLabelText("active")).toHaveTextContent("9 - Interlude");
  });

  // behavior: nextVideo steps active forward through current order (open order here)
  it("should advance the active video to the next entry in current order if nextVideo is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "do-next" }));

    // open order is 1, 21, ... so next from "1" is "21"
    expect(screen.getByLabelText("active")).toHaveTextContent("21 - Finale");
  });

  // behavior: nextVideo wraps last -> first in current order (E-3)
  it("should wrap to the first entry if nextVideo is called on the last video", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-12" });

    await user.click(screen.getByRole("button", { name: "do-next" }));

    // "12 - Bridge" is last in open order; wraps to first "1 - Opening"
    expect(screen.getByLabelText("active")).toHaveTextContent("1 - Opening");
  });

  // behavior: prevVideo wraps first -> last in current order (E-3)
  it("should wrap to the last entry if prevVideo is called on the first video", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "do-prev" }));

    // first in open order is "1 - Opening"; wraps to last "12 - Bridge"
    expect(screen.getByLabelText("active")).toHaveTextContent("12 - Bridge");
  });

  // behavior: prev/next follow the SORTED order after adding a sort key (AC-008 + AC-010)
  it("should step through natural-asc order if next is called after adding the title key", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "key-title" }));
    await user.click(screen.getByRole("button", { name: "do-next" }));

    // asc order is 1,3,9,... so next from "1" is "3 - Intro" (NOT open-order "21")
    expect(screen.getByLabelText("active")).toHaveTextContent("3 - Intro");
  });

  // behavior: adding a sort key preserves the active video (E-6)
  it("should keep the same active video if a sort key is added while a video is active", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-9" });

    await user.click(screen.getByRole("button", { name: "key-title" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("v-9");
  });

  // behavior: flipping direction preserves the active video (E-6)
  it("should keep the same active video if the sort direction is flipped", async () => {
    const user = userEvent.setup();
    renderProbe({
      videos: fixtureVideos,
      initialActiveVideoId: "v-9",
      initialSortKeys: ["title"],
    });

    await user.click(screen.getByRole("button", { name: "flip-dir" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("v-9");
  });

  // behavior: togglePlay flips isPlaying (AC-007)
  it("should flip isPlaying from false to true and back if togglePlay is called twice", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "do-play" }));
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");

    await user.click(screen.getByRole("button", { name: "do-play" }));
    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
  });

  // behavior: panels default to visible (open shell) if just mounted
  it("should default both sidebar and transport to visible if just mounted", () => {
    renderProbe({ videos: fixtureVideos });

    expect(screen.getByLabelText("sidebar-visible")).toHaveTextContent("true");
    expect(screen.getByLabelText("transport-visible")).toHaveTextContent(
      "true",
    );
  });

  // side-effect-contract: toggleSidebar flips sidebar visibility, leaving transport untouched
  it("should flip only sidebar visibility if toggleSidebar is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    await user.click(screen.getByRole("button", { name: "do-toggle-sidebar" }));

    expect(screen.getByLabelText("sidebar-visible")).toHaveTextContent("false");
    expect(screen.getByLabelText("transport-visible")).toHaveTextContent(
      "true",
    );
  });

  // side-effect-contract: toggleTransport flips transport visibility, leaving sidebar untouched
  it("should flip only transport visibility if toggleTransport is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    await user.click(
      screen.getByRole("button", { name: "do-toggle-transport" }),
    );

    expect(screen.getByLabelText("transport-visible")).toHaveTextContent(
      "false",
    );
    expect(screen.getByLabelText("sidebar-visible")).toHaveTextContent("true");
  });

  // side-effect-contract: toggling a panel twice restores it (hide then show)
  it("should restore the sidebar if toggleSidebar is called twice", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    const toggle = screen.getByRole("button", { name: "do-toggle-sidebar" });
    await user.click(toggle);
    await user.click(toggle);

    expect(screen.getByLabelText("sidebar-visible")).toHaveTextContent("true");
  });

  // behavior: re-selecting the already-active video keeps it active + selected (E-2)
  it("should keep the same video active and selected if the active video is selected again", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-9" });

    expect(screen.getByLabelText("active-id")).toHaveTextContent("v-9");

    await user.click(screen.getByRole("button", { name: "select-9" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("v-9");
    expect(screen.getByLabelText("selected-id")).toHaveTextContent("v-9");
  });

  // behavior: single-video playlist wraps next/prev to itself (E-4)
  it("should keep the single video active if next then prev is called with one video", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: singleVideoList, initialActiveVideoId: "solo" });

    await user.click(screen.getByRole("button", { name: "do-next" }));
    expect(screen.getByLabelText("active-id")).toHaveTextContent("solo");

    await user.click(screen.getByRole("button", { name: "do-prev" }));
    expect(screen.getByLabelText("active-id")).toHaveTextContent("solo");
  });
});
