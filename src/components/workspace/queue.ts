export type RepeatMode = "off" | "all" | "one";

export type EndedDecision =
  | { kind: "advance"; id: string }
  | { kind: "replay" }
  | { kind: "stop" };

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = {
  off: "all",
  all: "one",
  one: "off",
};

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return REPEAT_CYCLE[mode];
}

// Fisher-Yates over a copy (purity), RNG injected so tests are deterministic.
export function shuffleIds(ids: string[], rng: () => number): string[] {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Self-heal a frozen order against the live id set: keep the entries still
// present (in their frozen order), drop the gone ones, append the new at the end.
export function reconcileOrder(order: string[], ids: string[]): string[] {
  const present = new Set(ids);
  const kept = order.filter((id) => present.has(id));
  const known = new Set(kept);
  const appended = ids.filter((id) => !known.has(id));
  return [...kept, ...appended];
}

// What to do when the active video ends. repeat-one always replays; a computed
// next that equals the active (single-video repeat-all) replays; off at the end
// of the list stops; everything else advances to the next id (with wrap).
export function decideOnEnded(
  order: string[],
  activeId: string,
  mode: RepeatMode,
): EndedDecision {
  if (mode === "one") {
    return { kind: "replay" };
  }
  const index = order.indexOf(activeId);
  if (index === -1) {
    return { kind: "stop" };
  }
  const isLast = index === order.length - 1;
  if (mode === "off" && isLast) {
    return { kind: "stop" };
  }
  const nextId = order[(index + 1) % order.length];
  if (nextId === activeId) {
    return { kind: "replay" };
  }
  return { kind: "advance", id: nextId };
}
