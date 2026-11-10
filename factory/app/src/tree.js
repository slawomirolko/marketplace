export const START_KEY = "__start";
export const END_KEY = "__end";

export function isGroup(item) {
  return item.kind === "subgraph" || item.kind === "team";
}

export function buildLevel(workflows, name, prefix = name, stack = [name]) {
  const workflow = workflows.find((w) => w.name === name);
  if (!workflow) throw new Error(`workflow '${name}' not found`);
  const isRoot = stack.length === 1;
  const items = workflow.nodes.map((node) => {
    const key = `${prefix}/${node.id}`;
    if (node.kind === "subgraph" || node.kind === "map") {
      const known = workflows.some((w) => w.name === node.workflow) && !stack.includes(node.workflow);
      if (!known) return { key, kind: "missing", node };
      return { key, kind: "subgraph", node, inner: buildLevel(workflows, node.workflow, key, [...stack, node.workflow]) };
    }
    if (node.agents && node.agents.length > 1) {
      const agents = node.agents.map((a) => ({ key: `${key}#${a.id}`, kind: "agent", node, agent: { id: a.id, role: a.role ?? node.role }, nodePath: key }));
      return { key, kind: "team", node, inner: { items: agents, edges: [] } };
    }
    return { key, kind: "step", node };
  });
  const edges = workflow.edges
    .filter((e) => e.to !== "END" || isRoot)
    .map((e) => ({ from: `${prefix}/${e.from}`, to: e.to === "END" ? END_KEY : `${prefix}/${e.to}`, label: e.when ?? null }));
  if (isRoot) {
    items.unshift({ key: START_KEY, kind: "terminal", label: "start" });
    items.push({ key: END_KEY, kind: "terminal", label: "END" });
    edges.unshift({ from: START_KEY, to: `${prefix}/${workflow.entry}`, label: null });
  }
  return { items, edges };
}

export function costOf(item, report) {
  const byNode = report?.byNode ?? {};
  if (item.kind === "agent") return byNode[item.nodePath]?.byAgent?.[item.agent.id] ?? null;
  if (item.kind === "subgraph") {
    const parts = Object.entries(byNode).filter(([p]) => p.startsWith(`${item.key}/`)).map(([, c]) => c);
    if (parts.length === 0) return null;
    const sources = new Set(parts.map((c) => c.costSource));
    return {
      costUsd: Math.round(parts.reduce((s, c) => s + c.costUsd, 0) * 1e6) / 1e6,
      tokens: parts.reduce((s, c) => s + c.tokens, 0),
      steps: parts.reduce((s, c) => s + c.steps, 0),
      costSource: sources.size === 1 ? [...sources][0] : "mixed",
    };
  }
  return byNode[item.key] ?? null;
}

export function tierOf(item, config, report) {
  const cost = costOf(item, report);
  if (cost?.tier) return cost.tier;
  const role = item.kind === "agent" ? item.agent.role : item.node?.role;
  return role ? (config?.roles?.[role] ?? null) : null;
}

export function ledgerOf(item, run) {
  if (!run) return [];
  if (item.kind === "agent") return run.ledger.filter((r) => r.nodePath === item.nodePath && r.agentId === item.agent.id);
  if (item.kind === "subgraph") return run.ledger.filter((r) => r.nodePath.startsWith(`${item.key}/`));
  return run.ledger.filter((r) => r.nodePath === item.key);
}

export function formatUsd(cost) {
  if (!cost) return "not run";
  if (cost.costSource === "unknown") return "unknown";
  return `$${cost.costUsd.toFixed(6)}`;
}
