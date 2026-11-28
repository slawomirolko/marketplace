import { allItems, descendantKeys } from "./tree.ts";
import type { Cost, FactoryConfig, Item, Level, LedgerRecord, RunCall, RunData, RunIndex, RunPass, RunReport } from "./types.ts";

/** The cost of a graph node from the run report: an agent's or a step's own entry, or the backend's sum for a subgraph. */
export function costOf(item: Item, report: RunReport | null): Cost | null {
  if (!report) {
    return null;
  }
  if (item.kind === "agent") {
    return report.byNode[item.nodePath]?.byAgent?.[item.agent.id] ?? null;
  }
  if (item.kind === "subgraph") {
    return report.bySubgraph?.[item.key] ?? null;
  }
  return report.byNode[item.key] ?? null;
}

interface RanIndex {
  /** Every started node path and each of its parent paths. */
  paths: Set<string>;
  /** `nodePath`, a NUL and `agentId` of every agent with a ledger record or an agent_started event. */
  agents: Set<string>;
}

const ranByRun = new WeakMap<RunData, RanIndex>();

function agentRef(nodePath: string | undefined, agentId: string | null | undefined): string {
  return `${nodePath ?? ""}\u0000${agentId ?? ""}`;
}

/** What ran in a run, indexed once per run so each graph node is a set lookup instead of a scan of all events. */
function ranIndex(run: RunData): RanIndex {
  const known = ranByRun.get(run);
  if (known) {
    return known;
  }
  const index: RanIndex = { paths: new Set(), agents: new Set(run.ledger.map((r) => agentRef(r.nodePath, r.agentId))) };
  for (const e of run.events) {
    if (e.type === "agent_started") {
      index.agents.add(agentRef(e.node, e.agentId));
    } else if (e.type === "node_started" && typeof e.node === "string") {
      const parts = e.node.split("/");
      for (let i = 1; i <= parts.length; i++) {
        index.paths.add(parts.slice(0, i).join("/"));
      }
    }
  }
  ranByRun.set(run, index);
  return index;
}

export function ranIn(item: Item, run: RunData | null): boolean {
  if (!run || item.kind === "terminal") {
    return false;
  }
  const index = ranIndex(run);
  if (item.kind === "agent") {
    return index.agents.has(agentRef(item.nodePath, item.agent.id));
  }
  return [item.key, ...descendantKeys(item)].some((key) => index.paths.has(key));
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
  if (!parsed || typeof parsed !== "object") {
    return text;
  }
  const formatted = [parsed.type, parsed.status].filter(Boolean).join(" ") + (parsed.message ? `: ${parsed.message}` : "");
  return formatted || text;
}

/** The error text of the node_failed event behind a graph node, as the run recorded it. */
export function rawFailureOf(item: Item, run: RunData | null): string | null {
  if (!run || item.kind === "terminal") {
    return null;
  }
  const key = item.kind === "agent" ? item.nodePath : item.key;
  const event = run.events.find((e) => e.type === "node_failed" && (e.node === key || (item.kind === "subgraph" && e.node?.startsWith(`${key}/`))));
  return event ? String(event.error ?? "failed") : null;
}

export function failureOf(item: Item, run: RunData | null): string | null {
  const raw = rawFailureOf(item, run);
  return raw === null ? null : errorMessage(raw);
}

export function runFailure(run: RunData | null): string | null {
  const event = run?.events.find((e) => e.type === "node_failed" || e.type === "run_failed");
  return event ? `${event.node ? `${event.node}: ` : ""}${errorMessage(event.error)}` : null;
}

export function buildRunIndex(level: Level, config: FactoryConfig | null, report: RunReport | null, run: RunData | null): RunIndex {
  const index: RunIndex = new Map();
  for (const item of allItems(level)) {
    const cost = costOf(item, report);
    const tier = tierOf(item, config, report);
    index.set(item.key, { cost, tier, model: cost?.model ?? (tier ? report?.tierModels?.[tier] ?? null : null), failure: failureOf(item, run), runs: runCount(item, run, report), timeMs: timeSpent(item, report) });
  }
  return index;
}

type WorkflowStepItem = Exclude<Item, { kind: "terminal" } | { kind: "agent" }>;

function coversPath(item: WorkflowStepItem): (path: string) => boolean {
  const keys = item.kind === "subgraph" ? descendantKeys(item) : [item.key];
  const inside = item.kind === "subgraph";
  return (path) => keys.some((k) => path === k || (inside && path.startsWith(`${k}/`)));
}

export function runCount(item: Item, run: RunData | null, report: RunReport | null): number | null {
  if (!run || item.kind === "terminal") {
    return null;
  }
  if (item.kind === "agent") {
    const started = run.events.filter((e) => e.type === "agent_started" && e.node === item.nodePath && e.agentId === item.agent.id).length;
    if (started > 0) {
      return started;
    }
    return runCalls(report).filter((call) => call.node === item.nodePath && call.agent === item.agent.id).length;
  }
  const covers = coversPath(item);
  return run.events.filter((e) => e.type === "node_started" && typeof e.node === "string" && covers(e.node)).length;
}

/** The timed passes of a run, as the run report gives them. */
export function runPasses(report: RunReport | null): RunPass[] {
  return report?.passes ?? [];
}

/** The calls of a run in time order, as the run report gives them. */
export function runCalls(report: RunReport | null): RunCall[] {
  return report?.calls ?? [];
}

export interface TimedPass {
  node: string;
  visit: number | null;
  startedAt: string;
  status: string;
  durationMs: number | null;
  waitMs: number;
}

/**
 * The timed passes behind a graph node: an agent's own calls, a step's or team's visits
 * (a team visit is wall time, so its parallel agents are not added up), and for a group
 * every step visit inside it.
 */
export function itemPasses(item: Item, report: RunReport | null): TimedPass[] {
  if (!report || item.kind === "terminal") {
    return [];
  }
  if (item.kind === "agent") {
    return runCalls(report).filter((call) => call.node === item.nodePath && call.agent === item.agent.id);
  }
  const covers = coversPath(item);
  return runPasses(report).filter((pass) => covers(pass.node));
}

/** Total active time of a graph node in a run: the sum of its passes; null when no pass has a known duration. */
export function timeSpent(item: Item, report: RunReport | null): number | null {
  const known = itemPasses(item, report).map((p) => p.durationMs).filter((ms): ms is number => ms !== null);
  return known.length ? known.reduce((s, ms) => s + ms, 0) : null;
}
