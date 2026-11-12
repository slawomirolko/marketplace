import type { Cost, Coverage, FactoryConfig, GroupItem, Item, Level, LevelEdge, LedgerRecord, RunData, RunIndex, RunReport, Workflow, WorkflowAgent } from "./types.ts";

export const START_KEY = "__start";
export const END_KEY = "__end";

export function isGroup(item: Item): item is GroupItem {
  return item.kind === "subgraph" || item.kind === "team";
}

export function buildLevel(workflows: Workflow[], name: string, prefix = name, stack = [name], report: RunReport | null = null): Level {
  const workflow = workflows.find((w) => w.name === name);
  if (!workflow) throw new Error(`workflow '${name}' not found`);
  const isRoot = stack.length === 1;
  const items: Item[] = workflow.nodes.map((node): Item => {
    const key = `${prefix}/${node.id}`;
    if (node.kind === "subgraph" || node.kind === "map" || node.kind === "call" || node.kind === "group") {
      const inner = node.workflow;
      const known = inner !== undefined && workflows.some((w) => w.name === inner) && !stack.includes(inner);
      if (!known) return { key, kind: "missing", node };
      return { key, kind: "subgraph", node, inner: buildLevel(workflows, inner, node.kind === "group" ? prefix : key, [...stack, inner], report) };
    }
    const declared: WorkflowAgent[] = node.agents ?? (node.agentsFrom ? Object.keys(report?.byNode?.[key]?.byAgent ?? {}).map((id) => ({ id })) : []);
    if (declared.length > 1 || (node.agentsFrom && declared.length > 0)) {
      const agents = declared.map((a) => ({ key: `${key}#${a.id}`, kind: "agent" as const, node, agent: { id: a.id, role: a.role ?? node.role, ...(a.agent ? { agentName: a.agent } : {}) }, nodePath: key }));
      return { key, kind: "team", node, inner: { items: agents, edges: [] } };
    }
    return { key, kind: "step", node };
  });
  const finishKey = `${prefix}/__finish_${name}`;
  const finishes = !isRoot && workflow.edges.some((e) => e.to === "FINISH");
  const edges: LevelEdge[] = workflow.edges
    .filter((e) => e.to !== "END" || isRoot)
    .map((e) => {
      const branching = workflow.edges.filter((o) => o.from === e.from).length > 1;
      const condition = e.when ?? (branching ? "otherwise" : null);
      const label = e.description ? (condition ? `${e.description} (${condition})` : e.description) : condition;
      return { from: `${prefix}/${e.from}`, to: e.to === "END" || (e.to === "FINISH" && isRoot) ? END_KEY : e.to === "FINISH" ? finishKey : `${prefix}/${e.to}`, label };
    });
  if (finishes) items.push({ key: finishKey, kind: "terminal", label: "ends run" });
  if (isRoot) {
    items.unshift({ key: START_KEY, kind: "terminal", label: "start" });
    items.push({ key: END_KEY, kind: "terminal", label: "END" });
    edges.unshift({ from: START_KEY, to: `${prefix}/${workflow.entry}`, label: null });
  }
  return { items, edges };
}

export function descendantKeys(item: Item): string[] {
  if (!isGroup(item)) return [item.key];
  if (item.kind === "subgraph" && item.node.kind !== "group") return [item.key];
  return item.inner.items.flatMap((i) => (i.kind === "terminal" ? [] : descendantKeys(i)));
}

export function disabledKeys(run: RunData | null): string[] {
  if (!run) return [];
  return run.events.filter((e) => e.type === "node_completed" && typeof e.result === "string" && e.result.includes("skipped: switch off")).map((e) => String(e.node));
}

export function configDisabledKeys(level: Level | null, config: FactoryConfig | null): string[] {
  const switches = config?.switches ?? {};
  const keys: string[] = [];
  const walk = (items: Item[]) => {
    for (const item of items) {
      if (item.kind === "terminal" || item.kind === "agent") continue;
      const when = item.node.enabledWhen?.match(/^switches\.([a-z0-9-]+)\s*(==|!=)\s*(true|false)$/);
      if (when) {
        const value = switches[when[1]!] ?? true;
        const holds = when[2] === "==" ? String(value) === when[3] : String(value) !== when[3];
        if (!holds) keys.push(item.key);
      }
      if (isGroup(item)) walk(item.inner.items);
    }
  };
  if (level) walk(level.items);
  return keys;
}

export function isDisabled(key: string, disabled: string[]): boolean {
  return disabled.some((d) => key === d || key.startsWith(`${d}/`) || key.startsWith(`${d}#`));
}

export function costOf(item: Item, report: RunReport | null): Cost | null {
  const byNode = report?.byNode ?? {};
  if (item.kind === "agent") return byNode[item.nodePath]?.byAgent?.[item.agent.id] ?? null;
  if (item.kind === "subgraph") {
    const inside = descendantKeys(item);
    const parts = Object.entries(byNode).filter(([p]) => inside.some((k) => p === k || p.startsWith(`${k}/`))).map(([, c]) => c);
    if (parts.length === 0) return null;
    const sources = new Set(parts.map((c) => c.costSource));
    return {
      costUsd: Math.round(parts.reduce((s, c) => s + c.costUsd, 0) * 1e6) / 1e6,
      tokens: parts.reduce((s, c) => s + c.tokens, 0),
      cacheTokens: parts.reduce((s, c) => s + (c.cacheTokens ?? 0), 0),
      steps: parts.reduce((s, c) => s + c.steps, 0),
      llmSteps: parts.reduce((s, c) => s + (c.llmSteps ?? 0), 0),
      unknownSteps: parts.reduce((s, c) => s + (c.unknownSteps ?? 0), 0),
      costSource: sources.size === 1 ? ([...sources][0] ?? "mixed") : "mixed",
    };
  }
  return byNode[item.key] ?? null;
}

export function tierOf(item: Item, config: FactoryConfig | null, report: RunReport | null): string | null {
  const cost = costOf(item, report);
  if (cost?.tier) return cost.tier;
  if (item.kind === "terminal") return null;
  const role = item.kind === "agent" ? item.agent.role : item.node.role;
  return role ? (config?.roles?.[role] ?? null) : null;
}

export function ledgerOf(item: Item, run: RunData | null): LedgerRecord[] {
  if (!run) return [];
  if (item.kind === "agent") return run.ledger.filter((r) => r.nodePath === item.nodePath && r.agentId === item.agent.id);
  if (item.kind === "subgraph") {
    const inside = descendantKeys(item);
    return run.ledger.filter((r) => inside.some((k) => r.nodePath === k || r.nodePath.startsWith(`${k}/`)));
  }
  return run.ledger.filter((r) => r.nodePath === item.key);
}

interface ParsedError {
  type?: string | null;
  status?: string | number | null;
  message?: string | null;
}

function errorMessage(error: unknown): string {
  const text = String(error ?? "failed");
  let parsed: ParsedError | null = null;
  try {
    parsed = JSON.parse(text) as ParsedError | null;
  } catch {
    const first = (pattern: RegExp) => text.match(pattern)?.[1] ?? null;
    if (text.startsWith("{")) parsed = { type: first(/^\{"type":"([^"]+)"/), status: first(/"status":(\d+)/), message: first(/"message":"([^"]*)"/) };
  }
  if (!parsed) return text;
  return [parsed.type, parsed.status].filter(Boolean).join(" ") + (parsed.message ? `: ${parsed.message}` : "");
}

export function failureOf(item: Item, run: RunData | null): string | null {
  if (!run || item.kind === "terminal") return null;
  const key = item.kind === "agent" ? item.nodePath : item.key;
  const event = run.events.find((e) => e.type === "node_failed" && (e.node === key || (item.kind === "subgraph" && e.node?.startsWith(`${key}/`))));
  return event ? errorMessage(event.error) : null;
}

export function runFailure(run: RunData | null): string | null {
  const event = run?.events.find((e) => e.type === "node_failed" || e.type === "run_failed");
  return event ? `${event.node ? `${event.node}: ` : ""}${errorMessage(event.error)}` : null;
}

function allItems(level: Level): Item[] {
  return level.items.flatMap((item) => [item, ...(isGroup(item) ? allItems(item.inner) : [])]);
}

export function buildRunIndex(level: Level, config: FactoryConfig | null, report: RunReport | null, run: RunData | null): RunIndex {
  const index: RunIndex = new Map();
  for (const item of allItems(level)) {
    const cost = costOf(item, report);
    const tier = tierOf(item, config, report);
    index.set(item.key, { cost, tier, model: cost?.model ?? (tier ? report?.tierModels?.[tier] ?? null : null), failure: failureOf(item, run) });
  }
  return index;
}

export function formatTokens(tokens: number | null | undefined, cacheTokens?: number | null): string {
  const base = `${(tokens ?? 0).toLocaleString("en-US")} tok`;
  return cacheTokens ? `${base} + ${cacheTokens.toLocaleString("en-US")} cache` : base;
}

export function formatAmount(costUsd: number | null | undefined, coverage?: Coverage | null): string {
  const unknown = coverage?.unknownSteps ?? 0;
  if (unknown > 0 && unknown === coverage?.llmSteps) return "unknown";
  const amount = `$${(costUsd ?? 0).toFixed(6)}`;
  return unknown > 0 ? `≥ ${amount} (partial, ${unknown} of ${coverage?.llmSteps} LLM steps unknown)` : amount;
}

export function isUnknownCost(coverage?: Coverage | null): boolean {
  return (coverage?.unknownSteps ?? 0) > 0;
}

export function formatUsd(cost: Cost | null | undefined): string {
  if (!cost) return "not run";
  if (cost.costSource === "unknown") return "unknown";
  return formatAmount(cost.costUsd, cost);
}
