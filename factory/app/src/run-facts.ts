import { allItems, descendantKeys, isWithin } from "./tree.ts";
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
  const index: RanIndex = { paths: new Set(), agents: new Set(run.ledger.map((record) => agentRef(record.nodePath, record.agentId))) };
  for (const event of run.events) {
    if (event.type === "agent_started") {
      index.agents.add(agentRef(event.node, event.agentId));
    } else if (event.type === "node_started" && typeof event.node === "string") {
      const parts = event.node.split("/");
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
  if (cost?.tier) {
    return cost.tier;
  }
  if (item.kind === "terminal") {
    return null;
  }
  const role = item.kind === "agent" ? item.agent.role : item.node.role;
  return role ? (config?.roles?.[role] ?? null) : null;
}

export function ledgerOf(item: Item, run: RunData | null): LedgerRecord[] {
  if (!run) {
    return [];
  }
  if (item.kind === "agent") {
    return run.ledger.filter((record) => record.nodePath === item.nodePath && record.agentId === item.agent.id);
  }
  if (item.kind === "subgraph") {
    const inside = descendantKeys(item);
    return run.ledger.filter((record) => inside.some((key) => isWithin(record.nodePath, key)));
  }
  return run.ledger.filter((record) => record.nodePath === item.key);
}

interface ParsedError {
  type?: string | null;
  status?: string | number | null;
  message?: string | null;
}

/**
 * A readable error text: `type status: message` from a JSON error, else the text itself. The CLI backend cuts a
 * harness error to its first 300 characters (ERROR_TEXT_CHARS in factory/src/cli-backend.ts). An OpenCode error is
 * JSON, so the cut can leave it unparsable; the fields are then read from the text with patterns. A Claude CLI error
 * is usually plain text and is shown as it is.
 */
function errorMessage(error: unknown): string {
  const text = String(error ?? "failed");
  let parsed: ParsedError | null = null;
  try {
    parsed = JSON.parse(text) as ParsedError | null;
  } catch {
    const first = (pattern: RegExp) => text.match(pattern)?.[1] ?? null;
    if (text.startsWith("{")) {
      parsed = { type: first(/^\{"type":"([^"]+)"/), status: first(/"status":(\d+)/), message: first(/"message":"([^"]*)"/) };
    }
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
  const failedHere = (node: string | undefined) => node !== undefined && (item.kind === "subgraph" ? isWithin(node, key) : node === key);
  const event = run.events.find((candidate) => candidate.type === "node_failed" && failedHere(candidate.node));
  return event ? String(event.error ?? "failed") : null;
}

export function failureOf(item: Item, run: RunData | null): string | null {
  const raw = rawFailureOf(item, run);
  return raw === null ? null : errorMessage(raw);
}

export function runFailure(run: RunData | null): string | null {
  const event = run?.events.find((candidate) => candidate.type === "node_failed" || candidate.type === "run_failed");
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
  if (item.kind === "subgraph") {
    const keys = descendantKeys(item);
    return (path) => keys.some((key) => isWithin(path, key));
  }
  return (path) => path === item.key;
}

export function runCount(item: Item, run: RunData | null, report: RunReport | null): number | null {
  if (!run || item.kind === "terminal") {
    return null;
  }
  if (item.kind === "agent") {
    const started = run.events.filter((event) => event.type === "agent_started" && event.node === item.nodePath && event.agentId === item.agent.id).length;
    if (started > 0) {
      return started;
    }
    return runCalls(report).filter((call) => call.node === item.nodePath && call.agent === item.agent.id).length;
  }
  const covers = coversPath(item);
  return run.events.filter((event) => event.type === "node_started" && typeof event.node === "string" && covers(event.node)).length;
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
  const known = itemPasses(item, report).map((pass) => pass.durationMs).filter((ms): ms is number => ms !== null);
  return known.length ? known.reduce((sum, ms) => sum + ms, 0) : null;
}

/** The graph key a call selects: the team member for a call of a team agent, else the node itself. */
export function callKey(call: RunCall, teamNodes: Set<string>): string {
  return call.agent && teamNodes.has(call.node) ? `${call.node}#${call.agent}` : call.node;
}
