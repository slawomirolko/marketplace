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
      return { from: `${prefix}/${e.from}`, to: e.to === "END" || (e.to === "FINISH" && isRoot) ? END_KEY : e.to === "FINISH" ? finishKey : `${prefix}/${e.to}`, label, optional: condition !== null };
    });
  const exits = isRoot ? [] : workflow.edges.filter((e) => e.to === "END").map((e) => ({ from: `${prefix}/${e.from}`, optional: e.when !== undefined || workflow.edges.filter((o) => o.from === e.from).length > 1 }));
  if (finishes) items.push({ key: finishKey, kind: "terminal", label: "ends run" });
  if (isRoot) {
    items.unshift({ key: START_KEY, kind: "terminal", label: "start" });
    items.push({ key: END_KEY, kind: "terminal", label: "END" });
    edges.unshift({ from: START_KEY, to: `${prefix}/${workflow.entry}`, label: null, optional: false });
  }
  return { items, edges, entry: `${prefix}/${workflow.entry}`, exits };
}

export function descendantKeys(item: Item): string[] {
  if (!isGroup(item) || item.kind === "team") return [item.key];
  if (item.kind === "subgraph" && item.node.kind !== "group") return [item.key];
  return item.inner.items.flatMap((i) => (i.kind === "terminal" ? [] : descendantKeys(i)));
}

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

function touches(key: string, path: string): boolean {
  return path === key || path.startsWith(`${key}/`) || path.startsWith(`${key}#`);
}

export function isLive(item: Item, live: LiveState): boolean {
  if (!live.node && live.agents.length === 0) return false;
  const keys = item.kind === "agent" ? [item.key] : [item.key, ...descendantKeys(item)];
  return keys.some((k) => (live.node !== null && touches(k, live.node)) || live.agents.some((a) => touches(k, a)));
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

export function containedWorkflows(workflows: Workflow[], root: string): Set<string> {
  const found = new Set<string>();
  const visit = (name: string) => {
    if (found.has(name)) return;
    found.add(name);
    for (const node of workflows.find((w) => w.name === name)?.nodes ?? []) if (node.workflow) visit(node.workflow);
  };
  visit(root);
  return found;
}

export function mainAgentOf(workflow: Workflow | null): string | null {
  return workflow?.source?.match(/agents\/opencode\/([a-z0-9-]+)\.md/)?.[1] ?? null;
}

export function ranIn(item: Item, run: RunData | null): boolean {
  if (!run || item.kind === "terminal") return false;
  if (item.kind === "agent") {
    return run.ledger.some((r) => r.nodePath === item.nodePath && r.agentId === item.agent.id) || run.events.some((e) => e.type === "agent_started" && e.node === item.nodePath && e.agentId === item.agent.id);
  }
  const keys = [item.key, ...descendantKeys(item)];
  return run.events.some((e) => e.type === "node_started" && typeof e.node === "string" && keys.some((k) => e.node === k || e.node!.startsWith(`${k}/`)));
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

export function allItems(level: Level): Item[] {
  return level.items.flatMap((item) => [item, ...(isGroup(item) ? allItems(item.inner) : [])]);
}

export function buildRunIndex(level: Level, config: FactoryConfig | null, report: RunReport | null, run: RunData | null): RunIndex {
  const index: RunIndex = new Map();
  for (const item of allItems(level)) {
    const cost = costOf(item, report);
    const tier = tierOf(item, config, report);
    index.set(item.key, { cost, tier, model: cost?.model ?? (tier ? report?.tierModels?.[tier] ?? null : null), failure: failureOf(item, run), runs: runCount(item, run), timeMs: timeSpent(item, run) });
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

type WorkflowStepItem = Exclude<Item, { kind: "terminal" } | { kind: "agent" }>;

function coversPath(item: WorkflowStepItem): (path: string) => boolean {
  const keys = item.kind === "subgraph" ? descendantKeys(item) : [item.key];
  const inside = item.kind === "subgraph";
  return (path) => keys.some((k) => path === k || (inside && path.startsWith(`${k}/`)));
}

export function runCount(item: Item, run: RunData | null): number | null {
  if (!run || item.kind === "terminal") return null;
  if (item.kind === "agent") {
    const started = run.events.filter((e) => e.type === "agent_started" && e.node === item.nodePath && e.agentId === item.agent.id).length;
    if (started > 0) return started;
    const id = item.agent.id;
    return runCalls(run).filter((c) => c.node === item.nodePath && c.agent === id).length;
  }
  const covers = coversPath(item);
  return run.events.filter((e) => e.type === "node_started" && typeof e.node === "string" && covers(e.node)).length;
}

export interface RunCall {
  node: string;
  agent: string | null;
  agentName: string | null;
  visit: number | null;
  status: string;
  startedAt: string;
  costUsd: number | null;
  records: number;
  durationMs: number | null;
  waitMs: number;
}

export interface PassAgent {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  durationMs: number | null;
  waitMs: number;
}

/** One visit of one node: from its node_started to its completed, failed or skipped event. */
export interface RunPass {
  node: string;
  visit: number | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  agents: PassAgent[];
  records: LedgerRecord[];
  /** Active time: start to end minus the time spent waiting for a user answer; the ledger durationMs sum when the pass has no end. */
  durationMs: number | null;
  /** Time inside the pass spent waiting for a user answer (a question or a budget pause). */
  waitMs: number;
}

function endStatus(type: string, result: unknown): string {
  if (type === "node_failed" || type === "agent_failed" || type === "supervisor_failed") return "failed";
  if (type === "node_skipped") return "skipped";
  if (typeof result === "string" && result.includes("skipped: switch off")) return "switched off";
  return "done";
}

function elapsed(from: string, to: string | null): number | null {
  if (!to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

interface Span {
  from: number;
  to: number;
}

/** Spans in which the run stood still for the user: a question (needs_input) or a budget pause, each up to its run_resumed. */
function userWaits(events: RunData["events"]): Span[] {
  const spans: Span[] = [];
  let from: number | null = null;
  for (const e of events) {
    if (e.type === "needs_input" || (e.type === "budget_threshold" && e.level === "pause")) from ??= Date.parse(e.at);
    else if (e.type === "run_resumed" && from !== null) {
      spans.push({ from, to: Date.parse(e.at) });
      from = null;
    }
  }
  return spans;
}

function activeTime(from: string, to: string | null, waits: Span[]): { durationMs: number | null; waitMs: number } {
  const total = elapsed(from, to);
  if (total === null) return { durationMs: null, waitMs: 0 };
  const start = Date.parse(from);
  const end = start + total;
  const waitMs = waits.reduce((s, w) => s + Math.max(0, Math.min(end, w.to) - Math.max(start, w.from)), 0);
  return { durationMs: total - waitMs, waitMs };
}

function summed(records: LedgerRecord[]): { costUsd: number | null; durationMs: number | null } {
  const costUsd = records.some((r) => r.costUsd == null) ? null : Math.round(records.reduce((s, r) => s + (r.costUsd ?? 0), 0) * 1e6) / 1e6;
  const timed = records.filter((r) => typeof r.durationMs === "number");
  return { costUsd, durationMs: timed.length ? timed.reduce((s, r) => s + (r.durationMs ?? 0), 0) : null };
}

const PASS_END = new Set(["node_completed", "node_failed", "node_skipped", "supervisor_completed", "supervisor_failed"]);

export function runPasses(run: RunData | null): RunPass[] {
  if (!run) return [];
  const passes: RunPass[] = [];
  const open = new Map<string, RunPass>();
  for (const e of run.events) {
    if (typeof e.node !== "string") continue;
    if (e.type === "node_started" || e.type === "supervisor_started") {
      const pass: RunPass = { node: e.node, visit: typeof e.visit === "number" ? e.visit : null, startedAt: e.at, endedAt: null, status: "running", agents: [], records: [], durationMs: null, waitMs: 0 };
      passes.push(pass);
      open.set(e.node, pass);
      continue;
    }
    const pass = open.get(e.node);
    if (!pass) continue;
    if ((e.type === "agent_started" || e.type === "work_offered") && e.agentId) {
      if (!pass.agents.some((a) => a.id === e.agentId && a.endedAt === null)) pass.agents.push({ id: e.agentId, startedAt: e.at, endedAt: null, status: "running", durationMs: null, waitMs: 0 });
    } else if (e.type === "agent_completed" || e.type === "agent_failed") {
      const agent = pass.agents.findLast((a) => a.id === e.agentId && a.endedAt === null);
      if (agent) Object.assign(agent, { endedAt: e.at, status: endStatus(e.type, null) });
    } else if (PASS_END.has(e.type)) {
      Object.assign(pass, { endedAt: e.at, status: endStatus(e.type, e.result) });
      open.delete(e.node);
    }
  }
  for (const record of run.ledger) {
    const pass = passes.findLast((p) => p.node === record.nodePath && p.startedAt <= record.at) ?? passes.find((p) => p.node === record.nodePath);
    pass?.records.push(record);
  }
  const waits = userWaits(run.events);
  for (const pass of passes) {
    const time = activeTime(pass.startedAt, pass.endedAt, waits);
    pass.durationMs = time.durationMs ?? summed(pass.records).durationMs;
    pass.waitMs = time.waitMs;
    for (const agent of pass.agents) Object.assign(agent, activeTime(agent.startedAt, agent.endedAt, waits));
  }
  return passes;
}

export function runCalls(run: RunData | null): RunCall[] {
  if (!run) return [];
  const unfinished = LIVE_STATUSES.includes(run.status) ? "running" : "unfinished";
  return runPasses(run).flatMap((pass): RunCall[] => {
    const status = (s: string) => (s === "running" ? unfinished : s);
    const recorded = [...new Set(pass.records.map((r) => r.agentId).filter((id): id is string => Boolean(id)))];
    if (pass.agents.length === 0 && recorded.length > 1) {
      return recorded.map((id) => {
        const records = pass.records.filter((r) => r.agentId === id);
        const total = summed(records);
        return { node: pass.node, agent: id, agentName: records.find((r) => r.agentName)?.agentName ?? null, visit: pass.visit, status: status(pass.status), startedAt: pass.startedAt, costUsd: total.costUsd, records: records.length, durationMs: total.durationMs, waitMs: 0 };
      });
    }
    const agentIds = new Set(pass.agents.map((a) => a.id));
    if (agentIds.size > 1) {
      return pass.agents.map((a) => {
        const records = pass.records.filter((r) => r.agentId === a.id);
        const total = summed(records);
        return { node: pass.node, agent: a.id, agentName: records.find((r) => r.agentName)?.agentName ?? null, visit: pass.visit, status: status(a.status), startedAt: a.startedAt, costUsd: total.costUsd, records: records.length, durationMs: a.durationMs ?? total.durationMs, waitMs: a.waitMs };
      });
    }
    const total = summed(pass.records);
    const agent = pass.agents[0]?.id ?? pass.records.find((r) => r.agentId)?.agentId ?? null;
    return [{ node: pass.node, agent, agentName: pass.records.find((r) => r.agentName)?.agentName ?? null, visit: pass.visit, status: status(pass.status), startedAt: pass.startedAt, costUsd: total.costUsd, records: pass.records.length, durationMs: pass.durationMs, waitMs: pass.waitMs }];
  });
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
export function itemPasses(item: Item, run: RunData | null): TimedPass[] {
  if (!run || item.kind === "terminal") return [];
  if (item.kind === "agent") return runCalls(run).filter((c) => c.node === item.nodePath && c.agent === item.agent.id);
  const covers = coversPath(item);
  return runPasses(run).filter((p) => covers(p.node));
}

/** Total active time of a graph node in a run: the sum of its passes; null when no pass has a known duration. */
export function timeSpent(item: Item, run: RunData | null): number | null {
  const known = itemPasses(item, run).map((p) => p.durationMs).filter((ms): ms is number => ms !== null);
  return known.length ? known.reduce((s, ms) => s + ms, 0) : null;
}

export function findItem(level: Level, key: string): Item | null {
  return allItems(level).find((i) => i.key === key) ?? null;
}

export function ancestorKeys(level: Level, key: string): string[] {
  const found: string[] = [];
  const walk = (items: Item[], above: string[]): boolean => {
    for (const item of items) {
      if (item.key === key) {
        found.push(...above);
        return true;
      }
      if (isGroup(item) && walk(item.inner.items, [...above, item.key])) return true;
    }
    return false;
  };
  walk(level.items, []);
  return found;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const whole = Math.round(ms);
  if (whole < 1000) return `${whole}ms`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const s = Math.round(whole / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}
