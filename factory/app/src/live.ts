import { descendantKeys, isGroup, isWithin } from "./tree.ts";
import type { Item, Level, RunData } from "./types.ts";

export interface LiveState {
  node: string | null;
  agents: string[];
  waiting: string | null;
}

export const LIVE_STATUSES = ["running", "waiting_for_user", "waiting_for_client"];

export function liveState(run: RunData | null): LiveState {
  const idle: LiveState = { node: null, agents: [], waiting: null };
  if (!run || !LIVE_STATUSES.includes(run.status)) return idle;
  const nodes: string[] = [];
  const agents = new Set<string>();
  for (const e of run.events) {
    if (!e.node) continue;
    if (e.type === "node_started") nodes.push(e.node);
    else if (e.type === "node_completed" || e.type === "node_skipped" || e.type === "node_failed") {
      const at = nodes.lastIndexOf(e.node);
      if (at >= 0) nodes.splice(at, 1);
      for (const a of [...agents]) if (a.startsWith(`${e.node}#`)) agents.delete(a);
    } else if (e.type === "agent_started") agents.add(`${e.node}#${e.agentId}`);
    else if (e.type === "agent_completed" || e.type === "agent_failed") agents.delete(`${e.node}#${e.agentId}`);
  }
  for (const w of run.pendingWorkItems ?? []) agents.add(`${w.nodePath}#${w.agentId}`);
  const waiting = run.status === "waiting_for_user" ? (run.pendingQuestion?.node ?? nodes.at(-1) ?? null) : null;
  return { node: waiting ?? nodes.at(-1) ?? null, agents: [...agents], waiting };
}

export function isLive(item: Item, live: LiveState): boolean {
  if (!live.node && live.agents.length === 0) return false;
  const keys = item.kind === "agent" ? [item.key] : [item.key, ...descendantKeys(item)];
  return keys.some((k) => (live.node !== null && isWithin(live.node, k)) || live.agents.some((a) => isWithin(a, k)));
}

export function liveAncestors(level: Level, live: LiveState): string[] {
  const found: string[] = [];
  const walk = (items: Item[]) => {
    for (const item of items) {
      if (item.kind === "terminal" || !isGroup(item)) continue;
      if (isLive(item, live)) {
        found.push(item.key);
        walk(item.inner.items);
      }
    }
  };
  walk(level.items);
  return found;
}
