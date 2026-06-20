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
import type { VideoNode } from "@/components/workspace/mock-data";

const loadFixture: VideoNode[] = [
  { id: "l-1", name: "L1", format: "MP4", path: "/load/l1.mp4" },
  { id: "l-2", name: "L2", format: "MKV", path: "/load/l2.mkv" },
];

// 3-video list for the queue/repeat/shuffle behaviour. Open order is [A,B,C]
// with stable ids qa,qb,qc so initialActiveVideoId is deterministic.
const queueFixture: VideoNode[] = [
  { id: "qa", name: "A", format: "MP4", path: "/q/a.mp4" },
  { id: "qb", name: "B", format: "MP4", path: "/q/b.mp4" },
  { id: "qc", name: "C", format: "MP4", path: "/q/c.mp4" },
];

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
      <output aria-label="current">{String(ws.playbackCurrentSec)}</output>
      <output aria-label="duration">{String(ws.playbackDurationSec)}</output>
      <output aria-label="direction">{ws.sortDirection}</output>
      <output aria-label="keys">{ws.sortKeys.join(",") || "none"}</output>
      <output aria-label="sidebar-visible">
        {String(ws.isSidebarVisible)}
      </output>
      <output aria-label="transport-visible">
        {String(ws.isTransportVisible)}
      </output>
      <output aria-label="repeat">{ws.repeatMode}</output>
      <output aria-label="shuffling">{String(ws.isShuffling)}</output>
      <button onClick={() => ws.cycleRepeat()}>do-cycle-repeat</button>
      <button onClick={() => ws.toggleShuffle()}>do-toggle-shuffle</button>
      <button
        onClick={() =>
          ws.addVideos([
            { id: "qd", name: "D", format: "MP4", path: "/q/d.mp4" },
          ])
        }
      >
        do-add-d
      </button>
      <button onClick={() => ws.toggleSidebar()}>do-toggle-sidebar</button>
      <button onClick={() => ws.toggleTransport()}>do-toggle-transport</button>
      <button onClick={() => ws.toggleSortKey("title")}>key-title</button>
      <button onClick={() => ws.toggleSortKey("type")}>key-type</button>
      <button onClick={() => ws.toggleSortDirection()}>flip-dir</button>
      <button onClick={() => ws.nextVideo()}>do-next</button>
      <button onClick={() => ws.prevVideo()}>do-prev</button>
      <button onClick={() => ws.togglePlay()}>do-play</button>
      <button onClick={() => ws.selectNode("v-9")}>select-9</button>
      <button onClick={() => ws.loadVideos(loadFixture)}>do-load</button>
      <button onClick={() => ws.reportProgress(30, 60)}>do-progress</button>
      <button onClick={() => ws.reportEnded()}>do-ended</button>
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

  // behavior: selectNode auto-plays the newly active video (AC-009 / spec §1)
  it("should set isPlaying true if a node is selected", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "select-9" }));

    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // behavior: nextVideo steps active forward through current order (open order here)
  it("should advance the active video to the next entry in current order if nextVideo is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "do-next" }));

    // open order is 1, 21, ... so next from "1" is "21"
    expect(screen.getByLabelText("active")).toHaveTextContent("21 - Finale");
  });

  // behavior: nextVideo auto-plays the newly active video (AC-008 / spec §1)
  it("should set isPlaying true if nextVideo is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "do-next" }));

    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // behavior: prevVideo auto-plays the newly active video (AC-008 / spec §1)
  it("should set isPlaying true if prevVideo is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "do-prev" }));

    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
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

  // behavior: provider defaults to an empty playlist if no videos prop is given (spec §1: boots empty)
  it("should expose an empty playlist if no videos prop is supplied", () => {
    renderProbe({});

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByLabelText("active")).toHaveTextContent("none");
  });

  // behavior: playback figures start at 0 before any report (data model §5: 0 until first report)
  it("should expose playbackCurrentSec and playbackDurationSec of 0 if just mounted", () => {
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    expect(screen.getByLabelText("current")).toHaveTextContent("0");
    expect(screen.getByLabelText("duration")).toHaveTextContent("0");
  });

  // side-effect-contract: reportProgress pushes the live current/duration into state (AC-006)
  it("should store the reported current and duration if reportProgress is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "do-progress" }));

    expect(screen.getByLabelText("current")).toHaveTextContent("30");
    expect(screen.getByLabelText("duration")).toHaveTextContent("60");
  });

  // side-effect-contract: last video + repeat=off -> reportEnded stops, active unchanged (TC-002 / AC-002)
  it("should set isPlaying false and keep the active video if reportEnded is called on the last video with repeat off", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qc" });

    await user.click(screen.getByRole("button", { name: "do-play" }));
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");

    await user.click(screen.getByRole("button", { name: "do-ended" }));

    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
    expect(screen.getByLabelText("active-id")).toHaveTextContent("qc");
  });

  // behavior: mid-list + repeat=off -> reportEnded advances to next and keeps playing (TC-001 / AC-001)
  it("should advance to the next video and keep playing if reportEnded is called mid-list with repeat off", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qa" });

    await user.click(screen.getByRole("button", { name: "do-ended" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qb");
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // behavior: repeat defaults to off and shuffle to false (spec §5 defaults)
  it("should default repeatMode to off and isShuffling to false if just mounted", () => {
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qa" });

    expect(screen.getByLabelText("repeat")).toHaveTextContent("off");
    expect(screen.getByLabelText("shuffling")).toHaveTextContent("false");
  });

  // side-effect-contract: cycleRepeat steps off -> all -> one -> off (TC-008 / AC-007)
  it("should cycle repeatMode off -> all -> one -> off if cycleRepeat is called three times", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qa" });

    const cycle = screen.getByRole("button", { name: "do-cycle-repeat" });

    await user.click(cycle);
    expect(screen.getByLabelText("repeat")).toHaveTextContent("all");

    await user.click(cycle);
    expect(screen.getByLabelText("repeat")).toHaveTextContent("one");

    await user.click(cycle);
    expect(screen.getByLabelText("repeat")).toHaveTextContent("off");
  });

  // side-effect-contract: repeat=all wraps last -> first on ended, keeps playing (TC-003 / AC-003)
  it("should wrap to the first video and keep playing if the last video ends with repeat all", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qc" });

    await user.click(screen.getByRole("button", { name: "do-cycle-repeat" }));
    expect(screen.getByLabelText("repeat")).toHaveTextContent("all");

    await user.click(screen.getByRole("button", { name: "do-ended" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qa");
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // side-effect-contract: repeat=one replays same video from 0 and keeps playing (TC-004 / AC-004)
  it("should replay the same video from 0 and keep playing if a video ends with repeat one", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qb" });

    const cycle = screen.getByRole("button", { name: "do-cycle-repeat" });
    await user.click(cycle);
    await user.click(cycle);
    expect(screen.getByLabelText("repeat")).toHaveTextContent("one");

    await user.click(screen.getByRole("button", { name: "do-progress" }));
    expect(screen.getByLabelText("current")).toHaveTextContent("30");

    await user.click(screen.getByRole("button", { name: "do-ended" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qb");
    expect(screen.getByLabelText("current")).toHaveTextContent("0");
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // side-effect-contract: toggleShuffle flips isShuffling on (TC-005 setup / AC-007)
  it("should flip isShuffling to true if toggleShuffle is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qa" });

    await user.click(screen.getByRole("button", { name: "do-toggle-shuffle" }));

    expect(screen.getByLabelText("shuffling")).toHaveTextContent("true");
  });

  // behavior: toggling shuffle does not interrupt the active video or playback (TC-007 / AC-006)
  it("should keep the active video and isPlaying unchanged if shuffle is toggled on", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qb" });

    await user.click(screen.getByRole("button", { name: "do-play" }));
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");

    await user.click(screen.getByRole("button", { name: "do-toggle-shuffle" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qb");
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // behavior: with shuffle on, Next then Prev round-trips back to the same active (TC-005 / AC-005)
  it("should return to the same active video if Next then Prev is called while shuffling", async () => {
    // rng is injected only to make the frozen shuffle order deterministic; the
    // assertion is a round-trip property that holds for ANY stable order.
    const user = userEvent.setup();
    renderProbe({
      videos: queueFixture,
      initialActiveVideoId: "qa",
      rng: () => 0,
    });

    await user.click(screen.getByRole("button", { name: "do-toggle-shuffle" }));
    await user.click(screen.getByRole("button", { name: "do-next" }));
    await user.click(screen.getByRole("button", { name: "do-prev" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qa");
  });

  // behavior: with shuffle on, ended advances along the shuffled order, same as manual Next (TC-006 / AC-005)
  // repeat=all so ended always advances (wraps); the "ended == Next" invariant then holds at EVERY
  // position. Under repeat=off it would correctly STOP at the shuffled order's last entry instead.
  it("should auto-advance to the same id as Next would if a video ends while shuffling with repeat all", async () => {
    const user = userEvent.setup();
    renderProbe({
      videos: queueFixture,
      initialActiveVideoId: "qa",
      rng: () => 0,
    });

    await user.click(screen.getByRole("button", { name: "do-cycle-repeat" }));
    expect(screen.getByLabelText("repeat")).toHaveTextContent("all");
    await user.click(screen.getByRole("button", { name: "do-toggle-shuffle" }));
    await user.click(screen.getByRole("button", { name: "do-next" }));
    const afterNext = screen.getByLabelText("active-id").textContent?.trim();

    await user.click(screen.getByRole("button", { name: "do-prev" }));
    await user.click(screen.getByRole("button", { name: "do-ended" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent(
      afterNext ?? "",
    );
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // behavior: appending a video while shuffling slots it into the effective order
  // without reshuffling (E-5). rng=()=>0 freezes the shuffle order to [qb,qc,qa];
  // reconciling against [qa,qb,qc,qd] appends qd at the end -> [qb,qc,qa,qd], so
  // Next from qa (no longer last) lands on the appended qd.
  it("should append a dropped-in video to the shuffle order without reshuffling if added while shuffling", async () => {
    const user = userEvent.setup();
    renderProbe({
      videos: queueFixture,
      initialActiveVideoId: "qa",
      rng: () => 0,
    });

    await user.click(screen.getByRole("button", { name: "do-toggle-shuffle" }));
    await user.click(screen.getByRole("button", { name: "do-add-d" }));
    await user.click(screen.getByRole("button", { name: "do-next" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qd");
  });

  // behavior: changing the sort while shuffling does NOT reshuffle - the order is
  // frozen at toggle-on (E-6). With the title key, asc playlist is [qa,qb,qc] so the
  // frozen shuffle order (rng=0) is [qb,qc,qa]. Flipping to desc reorders the live
  // playlist to [qc,qb,qa] - so Next from qa would wrap to qc if the live order were
  // used, but the frozen order makes qa last -> wraps to qb. Asserting qb proves frozen.
  it("should keep the frozen shuffle order if the sort direction is flipped while shuffling", async () => {
    const user = userEvent.setup();
    renderProbe({
      videos: queueFixture,
      initialActiveVideoId: "qa",
      initialSortKeys: ["title"],
      rng: () => 0,
    });

    await user.click(screen.getByRole("button", { name: "do-toggle-shuffle" }));
    await user.click(screen.getByRole("button", { name: "flip-dir" }));
    await user.click(screen.getByRole("button", { name: "do-next" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qb");
  });

  // behavior: manual Next ignores repeat-one and advances (TC-009 / AC-007)
  it("should advance to the next video if Next is called with repeat one", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: queueFixture, initialActiveVideoId: "qa" });

    const cycle = screen.getByRole("button", { name: "do-cycle-repeat" });
    await user.click(cycle);
    await user.click(cycle);
    expect(screen.getByLabelText("repeat")).toHaveTextContent("one");

    await user.click(screen.getByRole("button", { name: "do-next" }));

    expect(screen.getByLabelText("active-id")).toHaveTextContent("qb");
  });

  // behavior: with no active video the queue verbs are no-ops and do not throw (TC-014 / E-1)
  it("should not throw or change state if reportEnded, toggleShuffle, cycleRepeat run with no active video", async () => {
    const user = userEvent.setup();
    renderProbe({});

    await user.click(screen.getByRole("button", { name: "do-ended" }));
    await user.click(screen.getByRole("button", { name: "do-toggle-shuffle" }));
    await user.click(screen.getByRole("button", { name: "do-cycle-repeat" }));

    expect(screen.getByLabelText("active")).toHaveTextContent("none");
    expect(screen.getByLabelText("playing")).toHaveTextContent("false");
    expect(screen.getByLabelText("shuffling")).toHaveTextContent("false");
    expect(screen.getByLabelText("repeat")).toHaveTextContent("off");
  });

  // side-effect-contract: loadVideos replaces the playlist, activates + plays the first (AC-002)
  it("should replace the playlist and activate-and-play the first if loadVideos is called", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos });

    await user.click(screen.getByRole("button", { name: "do-load" }));

    expect(playlistNames()).toEqual(["L1", "L2"]);
    expect(screen.getByLabelText("active-id")).toHaveTextContent("l-1");
    expect(screen.getByLabelText("playing")).toHaveTextContent("true");
  });

  // behavior: switching the active video via loadVideos resets the live playback figures to 0 (data model §5)
  it("should reset playback current and duration to 0 if loadVideos switches the active video", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "do-progress" }));
    expect(screen.getByLabelText("current")).toHaveTextContent("30");

    await user.click(screen.getByRole("button", { name: "do-load" }));

    expect(screen.getByLabelText("current")).toHaveTextContent("0");
    expect(screen.getByLabelText("duration")).toHaveTextContent("0");
  });

  // behavior: switching the active video via selectNode resets the live playback figures to 0 (data model §5)
  it("should reset playback figures to 0 if selectNode switches the active video", async () => {
    const user = userEvent.setup();
    renderProbe({ videos: fixtureVideos, initialActiveVideoId: "v-1" });

    await user.click(screen.getByRole("button", { name: "do-progress" }));
    expect(screen.getByLabelText("current")).toHaveTextContent("30");

    await user.click(screen.getByRole("button", { name: "select-9" }));

    expect(screen.getByLabelText("current")).toHaveTextContent("0");
    expect(screen.getByLabelText("duration")).toHaveTextContent("0");
  });
});
