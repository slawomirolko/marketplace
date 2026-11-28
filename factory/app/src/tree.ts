import type { AgentInfo, AskedBy, AskedByRef, AskedQuestion, Cost, Coverage, FactoryConfig, GroupItem, Item, Level, LevelEdge, LedgerRecord, RunCall, RunData, RunIndex, RunPass, RunReport, Workflow, WorkflowAgent } from "./types.ts";

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

/** A script step: an engine operation that belongs to no agent, drawn as its own step. */
export function isEngineScript(item: Item): boolean {
  return item.kind === "step" && item.node.kind === "script";
}

/** The marketplace agent or skill that runs this step or team member, if it names one. */
export function agentNameOf(item: Item): string | null {
  if (item.kind === "agent") return item.agent.agentName ?? item.node.agent ?? null;
  if (item.kind === "step" && item.node.kind === "llm") return item.node.agent ?? item.node.skill ?? null;
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

export interface HumanQuestion {
  node: string;
  id: string;
  text: string;
}

/** The human icon of a graph node: green when the step asks you itself, black when it only passes on a question another step asks. */
export interface HumanIcon {
  role: "asks" | "relays";
  sources: string[];
  /** Asking steps named as workflow/step that this diagram does not draw. */
  external: string[];
  questions: HumanQuestion[];
  permission: string | null;
}

function parentPath(key: string): string {
  return key.slice(0, key.lastIndexOf("/"));
}

function askedByRefs(askedBy: AskedBy | undefined): AskedByRef[] {
  if (askedBy === undefined) return [];
  return Array.isArray(askedBy) ? askedBy : [askedBy];
}

/** The workflow each drawn item comes from: the root workflow, or the one a subgraph, call or group draws inside it. */
function ownerWorkflows(level: Level, owner: string | null, owners: Map<string, string>): Map<string, string> {
  for (const item of level.items) {
    if (item.kind === "terminal") continue;
    const own = owner ?? item.key.split("/")[0]!;
    owners.set(item.key, own);
    if (item.kind === "subgraph") ownerWorkflows(item.inner, item.node.workflow ?? own, owners);
    if (item.kind === "team") ownerWorkflows(item.inner, own, owners);
  }
  return owners;
}

function sharedPrefix(a: string, b: string): number {
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at++;
  return at;
}

/**
 * Marks the steps that ask the user. A step asks when an interrupt names it in `askedBy`, when it asks
 * after a turn itself (`askAfterTurn`), or when its marketplace agent has a permission to ask. The interrupt
 * that passes the question on, and every group or team holding a step that asks, relay it.
 */
export function humanIcons(level: Level, agents: Record<string, AgentInfo>): Map<string, HumanIcon> {
  const items = allItems(level).filter((i): i is Exclude<Item, { kind: "terminal" }> => i.kind !== "terminal");
  const owners = ownerWorkflows(level, null, new Map());
  const icons = new Map<string, HumanIcon>();
  const asker = (key: string): HumanIcon => {
    const icon = icons.get(key) ?? { role: "asks" as const, sources: [key], external: [], questions: [], permission: null };
    icons.set(key, icon);
    return icon;
  };
  const drawnStep = (from: string, ref: AskedByRef): string | null => {
    if (typeof ref === "string") return `${parentPath(from)}/${ref}`;
    const found = items.filter((i) => i.kind === "step" && i.node.kind === "llm" && i.node.id === ref.step && owners.get(i.key) === ref.workflow);
    return found.sort((a, b) => sharedPrefix(b.key, from) - sharedPrefix(a.key, from))[0]?.key ?? null;
  };
  for (const item of items) {
    if (item.kind === "step" && item.node.kind === "interrupt" && item.node.askedBy && item.node.question) {
      const question = { node: item.key, id: item.node.question.id, text: item.node.question.text };
      const sources: string[] = [];
      const external: string[] = [];
      for (const ref of askedByRefs(item.node.askedBy)) {
        const source = drawnStep(item.key, ref);
        if (source) sources.push(source);
        else if (typeof ref !== "string") external.push(`${ref.workflow}/${ref.step}`);
      }
      for (const source of sources) asker(source).questions.push(question);
      icons.set(item.key, { role: "relays", sources, external, questions: [question], permission: null });
    }
    if (item.kind === "step" && item.node.kind === "llm" && item.node.askAfterTurn && item.node.question) {
      asker(item.key).questions.push({ node: item.key, id: item.node.question.id, text: item.node.question.text });
    }
    const name = agentNameOf(item);
    const permission = name ? (agents[name]?.asks ?? null) : null;
    if (permission) asker(item.key).permission = permission;
  }
  for (const item of items) {
    if (!isGroup(item) || icons.get(item.key)?.role === "asks") continue;
    const asking = allItems(item.inner).filter((i) => icons.get(i.key)?.role === "asks");
    const inside = asking.filter((i) => !asking.some((o) => o !== i && (i.key.startsWith(`${o.key}/`) || i.key.startsWith(`${o.key}#`))));
    if (inside.length) icons.set(item.key, { role: "relays", sources: inside.map((i) => i.key), external: [], questions: inside.flatMap((i) => icons.get(i.key)!.questions), permission: null });
  }
  return icons;
}

/** The step name in a graph key: the node id, or the agent id of a team member. */
export function stepName(key: string): string {
  return key.slice(Math.max(key.lastIndexOf("/"), key.lastIndexOf("#")) + 1);
}

/** The stored questions of a graph node: the ones it asked, the ones it passed on, or for a group every one inside it. */
export function questionsFor(key: string, questions: AskedQuestion[]): AskedQuestion[] {
  return questions.filter((q) => [...q.askedBy, q.node].some((path) => path !== null && touches(key, path)));
}

export function humanLabel(icon: HumanIcon): string {
  if (icon.role === "relays") {
    const from = [...new Set(icon.sources.map(stepName)), ...icon.external.map((step) => `${step} (not in this diagram)`)];
    return `Passes on a question to you from: ${from.join(", ")}. Click to see the questions and your answers in this run`;
  }
  const asked = icon.questions.map((q) => `${q.id} (through ${stepName(q.node)})`);
  return [asked.length ? `Asks you: ${asked.join(", ")}` : null, icon.permission ? `May ask you itself (${icon.permission})` : null].filter(Boolean).join(". ") + ". Click to see the questions and your answers in this run";
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

export function allItems(level: Level): Item[] {
  return level.items.flatMap((item) => [item, ...(isGroup(item) ? allItems(item.inner) : [])]);
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
