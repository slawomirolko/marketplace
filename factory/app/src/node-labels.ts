import { formatUsd } from "./format.ts";
import type { Item, RunIndexEntry, RunReport, WorkflowItem } from "./types.ts";

export const EMPTY_ENTRY: RunIndexEntry = { cost: null, tier: null, model: null, failure: null, runs: null, timeMs: null };

export function nodeTitle(item: Item): string {
  if (item.kind === "agent") {
    return item.agent.id;
  }
  if (item.kind === "terminal") {
    return item.label;
  }
  return item.node.id;
}

/** The kind word of a subgraph item: a call or a group keeps its own name, a subgraph or map shows as subgraph. */
function subgraphKind(kind: string): string {
  return kind === "call" || kind === "group" ? kind : "subgraph";
}

/** The second line of a node card: what runs it (agent, skill, team, subgraph or engine script) and its role. */
export function nodeSubtitle(item: Item): string {
  if (item.kind === "terminal") {
    return item.label;
  }
  if (item.kind === "agent") {
    return `agent · ${item.agent.role}`;
  }
  if (item.kind === "team") {
    return `llm · ${item.inner.items.length} agents`;
  }
  if (item.node.agentsFrom) {
    return `llm · agents from ${item.node.agentsFrom}`;
  }
  if (item.node.agent) {
    return `llm · ${item.node.agent}`;
  }
  if (item.kind === "subgraph") {
    return `${subgraphKind(item.node.kind)} · ${item.node.workflow}${item.node.enabledWhen ? ` · when ${item.node.enabledWhen}` : ""}${item.node.required ? " · required" : ""}`;
  }
  if (item.node.skill) {
    return `llm · skill ${item.node.skill}`;
  }
  if (item.kind === "missing") {
    return `subgraph · ${item.node.workflow} (not found)`;
  }
  if (item.node.kind === "script") {
    return item.node.op ? `engine script · ${item.node.op}` : "engine script";
  }
  return item.node.role ? `${item.node.kind} · ${item.node.role}` : item.node.kind;
}

export function nodeAriaLabel(item: Item, report: RunReport | null, entry: RunIndexEntry = EMPTY_ENTRY): string {
  if (item.kind === "terminal") {
    return item.label;
  }
  const cost = report ? (entry.failure ? `failed: ${entry.failure}` : formatUsd(entry.cost)) : null;
  return [nodeTitle(item), nodeSubtitle(item), cost].filter(Boolean).join(", ");
}

/** True for a workflow step marked `required`: switching it off is shown as a warning. */
export function isRequired(item: Item): boolean {
  return item.kind !== "terminal" && item.kind !== "agent" && Boolean(item.node.required);
}

/** The kind row of the details panel. */
export function kindLabel(item: WorkflowItem): string {
  if (item.kind === "team") {
    return `llm, ${item.inner.items.length} agents`;
  }
  if (item.kind === "agent") {
    return "agent";
  }
  if (item.node.kind === "script") {
    return "engine script";
  }
  return item.node.kind;
}
