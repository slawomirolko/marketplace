import { descendantKeys, isGroup, isWithin } from "./tree.ts";
import type { Item, Level, RunData } from "./types.ts";

export interface LiveState {
  node: string | null;
  agents: string[];
  waiting: string | null;
}

export const LIVE_STATUSES = ["running", "waiting_for_user", "waiting_for_client"];

const NODE_ENDS = new Set(["node_completed", "node_skipped", "node_failed"]);
const AGENT_ENDS = new Set(["agent_completed", "agent_failed"]);

/** The step running now (or waiting for an answer) and the team agents still working, from the events of a live run. */
export function liveState(run: RunData | null): LiveState {
  const idle: LiveState = { node: null, agents: [], waiting: null };
  if (!run || !LIVE_STATUSES.includes(run.status)) {
    return idle;
  }
  const nodes: string[] = [];
  const agents = new Set<string>();
  for (const event of run.events) {
    if (!event.node) {
      continue;
    }
    if (event.type === "node_started") {
      nodes.push(event.node);
    } else if (NODE_ENDS.has(event.type)) {
      const at = nodes.lastIndexOf(event.node);
      if (at >= 0) {
        nodes.splice(at, 1);
      }
      for (const agent of [...agents]) {
        if (agent.startsWith(`${event.node}#`)) {
          agents.delete(agent);
        }
      }
    } else if (event.type === "agent_started") {
      agents.add(`${event.node}#${event.agentId}`);
    } else if (AGENT_ENDS.has(event.type)) {
      agents.delete(`${event.node}#${event.agentId}`);
    }
  }
  for (const workItem of run.pendingWorkItems ?? []) {
    agents.add(`${workItem.nodePath}#${workItem.agentId}`);
  }
  const waiting = run.status === "waiting_for_user" ? (run.pendingQuestion?.node ?? nodes.at(-1) ?? null) : null;
  return { node: waiting ?? nodes.at(-1) ?? null, agents: [...agents], waiting };
}

export function isLive(item: Item, live: LiveState): boolean {
  if (!live.node && live.agents.length === 0) {
    return false;
  }
  const keys = item.kind === "agent" ? [item.key] : [item.key, ...descendantKeys(item)];
  return keys.some((key) => (live.node !== null && isWithin(live.node, key)) || live.agents.some((agent) => isWithin(agent, key)));
}

export function liveAncestors(level: Level, live: LiveState): string[] {
  const found: string[] = [];
  const walk = (items: Item[]) => {
    for (const item of items) {
      if (item.kind === "terminal" || !isGroup(item)) {
        continue;
      }
      if (isLive(item, live)) {
        found.push(item.key);
        walk(item.inner.items);
      }
    }
  };
  walk(level.items);
  return found;
}
