import type { AgentInfo, GroupItem, Item, Level, LevelEdge, RunReport, Workflow, WorkflowAgent, WorkflowEdge } from "./types.ts";

export const START_KEY = "__start";
export const END_KEY = "__end";

export function isGroup(item: Item): item is GroupItem {
  return item.kind === "subgraph" || item.kind === "team";
}

/**
 * True when a graph key or node path is the ancestor itself or lies inside it: a nested node (`ancestor/...`)
 * or a team member (`ancestor#agent`). Node paths of the engine never hold a `#`, so for them only the
 * `/` form can match.
 */
export function isWithin(key: string, ancestor: string): boolean {
  return key === ancestor || key.startsWith(`${ancestor}/`) || key.startsWith(`${ancestor}#`);
}

function edgeLabel(edge: WorkflowEdge, branching: boolean): { label: string | null; condition: string | null } {
  const condition = edge.when ?? (branching ? "otherwise" : null);
  if (!edge.description) {
    return { label: condition, condition };
  }
  return { label: condition ? `${edge.description} (${condition})` : edge.description, condition };
}

/** Where an edge points in the drawn graph: END at the root ends the graph, FINISH inside a subgraph ends the run. */
function edgeTarget(edge: WorkflowEdge, isRoot: boolean, prefix: string, finishKey: string): string {
  if (edge.to === "END" || (edge.to === "FINISH" && isRoot)) {
    return END_KEY;
  }
  if (edge.to === "FINISH") {
    return finishKey;
  }
  return `${prefix}/${edge.to}`;
}

export function buildLevel(workflows: Workflow[], name: string, prefix = name, stack = [name], report: RunReport | null = null): Level {
  const workflow = workflows.find((candidate) => candidate.name === name);
  if (!workflow) {
    throw new Error(`workflow '${name}' not found`);
  }
  const isRoot = stack.length === 1;
  const items: Item[] = workflow.nodes.map((node): Item => {
    const key = `${prefix}/${node.id}`;
    if (node.kind === "subgraph" || node.kind === "map" || node.kind === "call" || node.kind === "group") {
      const inner = node.workflow;
      const known = inner !== undefined && workflows.some((candidate) => candidate.name === inner) && !stack.includes(inner);
      if (!known) {
        return { key, kind: "missing", node };
      }
      return { key, kind: "subgraph", node, inner: buildLevel(workflows, inner, node.kind === "group" ? prefix : key, [...stack, inner], report) };
    }
    const declared: WorkflowAgent[] = node.agents ?? (node.agentsFrom ? Object.keys(report?.byNode?.[key]?.byAgent ?? {}).map((id) => ({ id })) : []);
    if (declared.length > 1 || (node.agentsFrom && declared.length > 0)) {
      const agents = declared.map((agent) => ({ key: `${key}#${agent.id}`, kind: "agent" as const, node, agent: { id: agent.id, role: agent.role ?? node.role, ...(agent.agent ? { agentName: agent.agent } : {}) }, nodePath: key }));
      return { key, kind: "team", node, inner: { items: agents, edges: [] } };
    }
    return { key, kind: "step", node };
  });
  const finishKey = `${prefix}/__finish_${name}`;
  const finishes = !isRoot && workflow.edges.some((edge) => edge.to === "FINISH");
  const isBranching = (from: string) => workflow.edges.filter((other) => other.from === from).length > 1;
  const edges: LevelEdge[] = workflow.edges
    .filter((edge) => edge.to !== "END" || isRoot)
    .map((edge) => {
      const { label, condition } = edgeLabel(edge, isBranching(edge.from));
      return { from: `${prefix}/${edge.from}`, to: edgeTarget(edge, isRoot, prefix, finishKey), label, optional: condition !== null };
    });
  const exits = isRoot ? [] : workflow.edges.filter((edge) => edge.to === "END").map((edge) => ({ from: `${prefix}/${edge.from}`, optional: edge.when !== undefined || isBranching(edge.from) }));
  if (finishes) {
    items.push({ key: finishKey, kind: "terminal", label: "ends run" });
  }
  if (isRoot) {
    items.unshift({ key: START_KEY, kind: "terminal", label: "start" });
    items.push({ key: END_KEY, kind: "terminal", label: "END" });
    edges.unshift({ from: START_KEY, to: `${prefix}/${workflow.entry}`, label: null, optional: false });
  }
  return { items, edges, entry: `${prefix}/${workflow.entry}`, exits };
}

/** The keys a graph node stands for: its own key, or for a group (which draws no node of its own) every key inside it. */
export function descendantKeys(item: Item): string[] {
  if (!isGroup(item) || item.kind === "team") {
    return [item.key];
  }
  if (item.kind === "subgraph" && item.node.kind !== "group") {
    return [item.key];
  }
  return item.inner.items.flatMap((inner) => (inner.kind === "terminal" ? [] : descendantKeys(inner)));
}

export function containedWorkflows(workflows: Workflow[], root: string): Set<string> {
  const found = new Set<string>();
  const visit = (name: string) => {
    if (found.has(name)) {
      return;
    }
    found.add(name);
    for (const node of workflows.find((workflow) => workflow.name === name)?.nodes ?? []) {
      if (node.workflow) {
        visit(node.workflow);
      }
    }
  };
  visit(root);
  return found;
}

/** A script step: an engine operation that belongs to no agent, drawn as its own step. */
export function isEngineScript(item: Item): boolean {
  return item.kind === "step" && item.node.kind === "script";
}

/** The marketplace agent or skill that runs this step or team member, if it names one. */
export function agentNameOf(item: Item): string | null {
  if (item.kind === "agent") {
    return item.agent.agentName ?? item.node.agent ?? null;
  }
  if (item.kind === "step" && item.node.kind === "llm") {
    return item.node.agent ?? item.node.skill ?? null;
  }
  return null;
}

/** The skill scripts an agent may run: part of the agent, so drawn inside its box. */
export function agentScripts(item: Item, agents: Record<string, AgentInfo>): AgentInfo["scripts"] {
  const name = agentNameOf(item);
  return name ? (agents[name]?.scripts ?? []) : [];
}

/** True when the agent behind this step or team member declares the configured memory-layer skill. */
export function hasMemoryLayer(item: Item, agents: Record<string, AgentInfo>): boolean {
  const name = agentNameOf(item);
  return name ? agents[name]?.memoryLayer === true : false;
}

/** The step name in a graph key: the node id, or the agent id of a team member. */
export function stepName(key: string): string {
  return key.slice(Math.max(key.lastIndexOf("/"), key.lastIndexOf("#")) + 1);
}

/** A node path without its root workflow name, or the path itself when it has no parent. */
export function shortPath(path: string): string {
  return path.split("/").slice(1).join("/") || path;
}

export function allItems(level: Level): Item[] {
  return level.items.flatMap((item) => [item, ...(isGroup(item) ? allItems(item.inner) : [])]);
}

export function findItem(level: Level, key: string): Item | null {
  return allItems(level).find((item) => item.key === key) ?? null;
}

export function ancestorKeys(level: Level, key: string): string[] {
  const found: string[] = [];
  const walk = (items: Item[], above: string[]): boolean => {
    for (const item of items) {
      if (item.key === key) {
        found.push(...above);
        return true;
      }
      if (isGroup(item) && walk(item.inner.items, [...above, item.key])) {
        return true;
      }
    }
    return false;
  };
  walk(level.items, []);
  return found;
}

export type WorkflowNodeAt = Workflow["nodes"][number] & { at: string };

/** Every node of a workflow with its path, groups, subgraphs and calls expanded; a workflow already on the path is not entered again. */
export function allNodes(workflow: Workflow, workflows: Workflow[], prefix = "", seen: string[] = []): WorkflowNodeAt[] {
  return workflow.nodes.flatMap((node) => {
    const here = { ...node, at: `${prefix}${node.id}` };
    const inner = node.workflow ? workflows.find((candidate) => candidate.name === node.workflow) : undefined;
    if (!inner || seen.includes(inner.name)) {
      return [here];
    }
    return [here, ...allNodes(inner, workflows, node.kind === "group" ? prefix : `${prefix}${node.id}/`, [...seen, workflow.name])];
  });
}
