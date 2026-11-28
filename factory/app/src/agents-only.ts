import { END_KEY, START_KEY, isEngineScript } from "./tree.ts";
import type { Item, Level, LevelEdge, SubgraphItem } from "./types.ts";

interface Place {
  level: Level;
  container: SubgraphItem | null;
  path: string[];
}

interface Hop {
  to: string;
  optional: boolean;
}

function isShown(item: Item): boolean {
  return item.kind === "team" || (item.kind === "step" && item.node.kind === "llm") || isEngineScript(item);
}

function isSwitchable(item: SubgraphItem): boolean {
  return Boolean(item.node.enabledWhen) && !item.node.required;
}

function indexPlaces(level: Level, container: SubgraphItem | null, path: string[], places: Map<string, Place>, items: Map<string, Item>): void {
  for (const item of level.items) {
    places.set(item.key, { level, container, path });
    items.set(item.key, item);
    if (item.kind === "subgraph") indexPlaces(item.inner, item, [...path, item.key], places, items);
  }
}

/**
 * Reduces a workflow level tree to its agent steps (`llm` steps and agent teams) and engine scripts. Question
 * and missing steps are hidden: each kept step is linked to the next kept steps reachable through hidden
 * steps, once per pair. A link is optional (dashed) when every path it replaces has a condition, an
 * `otherwise` branch, or enters a subgraph that a switch can skip. Subgraphs stay as containers when
 * they still hold a shown step; a link between containers is lifted to their common level, as in the full view.
 */
export function agentsOnly(root: Level): Level {
  const places = new Map<string, Place>();
  const items = new Map<string, Item>();
  indexPlaces(root, null, [], places, items);
  const hasEnd = items.has(END_KEY);
  const isFinish = (key: string) => items.get(key)?.kind === "terminal" && key !== START_KEY && key !== END_KEY;
  const kept = (key: string) => key === START_KEY || key === END_KEY || isShown(items.get(key)!);

  /** Each subgraph is entered or left once per hop search, so a loop through switchable subgraphs ends. */
  const target = (key: string, optional: boolean, out: Hop[], visited: Set<string>): void => {
    const item = items.get(key);
    if (item?.kind !== "subgraph") {
      if (!isFinish(key)) out.push({ to: key, optional });
      else if (hasEnd) out.push({ to: END_KEY, optional });
      return;
    }
    const entered = `enter:${key}:${optional}`;
    if (visited.has(entered)) {
      return;
    }
    visited.add(entered);
    const skippable = isSwitchable(item);
    if (item.inner.entry) {
      target(item.inner.entry, optional || skippable, out, visited);
    }
    if (skippable) {
      leave(item.key, true, out, visited);
    }
  };
  const leave = (key: string, optional: boolean, out: Hop[], visited: Set<string>): void => {
    const left = `leave:${key}:${optional}`;
    if (visited.has(left)) {
      return;
    }
    visited.add(left);
    const place = places.get(key)!;
    for (const edge of place.level.edges) {
      if (edge.from === key) {
        target(edge.to, optional || Boolean(edge.optional), out, visited);
      }
    }
    for (const exit of place.level.exits ?? []) {
      if (exit.from === key && place.container) {
        leave(place.container.key, optional || exit.optional, out, visited);
      }
    }
  };
  const hops = (key: string): Hop[] => {
    const out: Hop[] = [];
    leave(key, false, out, new Set());
    return out;
  };

  const links = new Map<string, Map<string, boolean>>();
  for (const from of items.keys()) {
    if (!kept(from) || from === END_KEY) continue;
    const found = new Map<string, boolean>();
    const best = new Map<string, boolean>();
    const stack: Hop[] = hops(from);
    while (stack.length) {
      const hop = stack.pop()!;
      if (kept(hop.to)) {
        found.set(hop.to, (found.get(hop.to) ?? true) && hop.optional);
        continue;
      }
      const seen = best.get(hop.to);
      if (seen === false || seen === hop.optional) continue;
      best.set(hop.to, hop.optional);
      for (const next of hops(hop.to)) stack.push({ to: next.to, optional: hop.optional || next.optional });
    }
    found.delete(from);
    links.set(from, found);
  }

  const lifted = new Map<Level, Map<string, LevelEdge>>();
  for (const [from, targets] of links) {
    for (const [to, optional] of targets) {
      const a = places.get(from)!;
      const b = places.get(to)!;
      let depth = 0;
      while (depth < a.path.length && depth < b.path.length && a.path[depth] === b.path[depth]) depth++;
      const source = a.path[depth] ?? from;
      const sink = b.path[depth] ?? to;
      if (source === sink) continue;
      const container = depth === 0 ? null : (items.get(a.path[depth - 1]!) as SubgraphItem);
      const level = container ? container.inner : root;
      const original = level.edges.find((e) => e.from === source && e.to === sink);
      const id = `${source}->${sink}`;
      const edges = lifted.get(level) ?? new Map<string, LevelEdge>();
      const prior = edges.get(id);
      const dashed = prior ? Boolean(prior.dashed) && optional : optional;
      edges.set(id, { from: source, to: sink, label: original?.label ?? null, dashed });
      lifted.set(level, edges);
    }
  }

  const holdsShown = (item: Item): boolean => (item.kind === "subgraph" ? item.inner.items.some(holdsShown) : isShown(item));
  const reduce = (level: Level): Level => {
    const shown = level.items.flatMap((item): Item[] => {
      if (item.kind === "subgraph") return holdsShown(item) ? [{ ...item, inner: reduce(item.inner) }] : [];
      return kept(item.key) ? [item] : [];
    });
    return { items: shown, edges: [...(lifted.get(level)?.values() ?? [])], ...(level.entry ? { entry: level.entry } : {}) };
  };
  return reduce(root);
}
