import type { LedgerRecord, Run, RunEvent } from "./types.ts";

export const SUPERVISOR_PATH = "@supervisor";

export interface NodeSummary {
  node: string;
  kind: "llm" | "script" | "mixed" | "none";
  tier: string | null;
  model: string | null;
  visits: number;
  calls: number;
  agents: string[];
  costUsd: number;
  costShare: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
  timeShare: number;
  failures: number;
}

export interface QuestionSummary {
  questionId: string;
  node: string | null;
  waitMs: number | null;
}

export interface RunSummary {
  run: { runId: string; workflow: string; goal: string; status: string; backend: string | null; tierModels: Record<string, string>; budgetUsd: number | null };
  totals: { costUsd: number; budgetRatio: number | null; tokens: number; cacheTokens: number; llmSteps: number; scriptSteps: number; unknownCostSteps: number; wallMs: number; agentMs: number };
  nodes: NodeSummary[];
  loops: { node: string; visits: number }[];
  failures: { node: string | null; agentId: string | null; error: string }[];
  questions: QuestionSummary[];
  clientWaits: { node: string; agentId: string | null; waitMs: number }[];
  skipped: { node: string; reason: string }[];
  budget: { level: string; ratio: number }[];
  top: { costNode: string | null; timeNode: string | null; longestQuestion: string | null };
}

const NODE_END = new Set(["node_completed", "node_skipped", "node_failed"]);
const RUN_END = new Set(["run_completed", "run_failed", "run_cancelled", "budget_exceeded"]);

function ms(at: string): number {
  return Date.parse(at);
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);
}

function backendLabel(run: Run): string | null {
  const backend = run.config?.backend;
  if (!backend) return null;
  return backend.kind === "cli" && backend.cli ? `cli:${backend.cli}` : backend.kind;
}

function kindOf(records: LedgerRecord[]): NodeSummary["kind"] {
  const kinds = new Set(records.map((r) => r.kind));
  if (kinds.size === 0) return "none";
  if (kinds.size > 1) return "mixed";
  return records[0]?.kind ?? "none";
}

function single(values: (string | null | undefined)[]): string | null {
  const set = new Set(values.filter((v): v is string => typeof v === "string"));
  if (set.size === 0) return null;
  return set.size === 1 ? [...set][0] ?? null : "mixed";
}

function nodeWallTimes(events: RunEvent[]): Map<string, number> {
  const open = new Map<string, number>();
  const wall = new Map<string, number>();
  for (const event of events) {
    const node = typeof event.node === "string" ? event.node : undefined;
    if (!node) continue;
    if (event.type === "node_started") open.set(node, ms(event.at));
    if (NODE_END.has(event.type) && open.has(node)) {
      wall.set(node, (wall.get(node) ?? 0) + Math.max(0, ms(event.at) - (open.get(node) ?? 0)));
      open.delete(node);
    }
  }
  return wall;
}

function questionWaits(events: RunEvent[]): QuestionSummary[] {
  const asked: { questionId: string; node: string | null; at: number }[] = [];
  const answered = new Map<string, number>();
  for (const event of events) {
    if (event.type === "needs_input" && typeof event.questionId === "string") asked.push({ questionId: event.questionId, node: typeof event.node === "string" ? event.node : null, at: ms(event.at) });
    if (event.type === "run_resumed" && typeof event.questionId === "string") answered.set(event.questionId, ms(event.at));
  }
  return asked.map((q) => {
    const at = answered.get(q.questionId);
    return { questionId: q.questionId, node: q.node, waitMs: at === undefined ? null : Math.max(0, at - q.at) };
  });
}

function clientWaits(events: RunEvent[]): RunSummary["clientWaits"] {
  const offered = new Map<string, number>();
  const waits: RunSummary["clientWaits"] = [];
  for (const event of events) {
    const key = `${text(event.node)}|${text(event.agentId)}`;
    if (event.type === "work_offered") offered.set(key, ms(event.at));
    if (event.type === "agent_completed" && event.backend === "delegate" && offered.has(key)) {
      waits.push({ node: text(event.node), agentId: typeof event.agentId === "string" ? event.agentId : null, waitMs: Math.max(0, ms(event.at) - (offered.get(key) ?? 0)) });
      offered.delete(key);
    }
  }
  return waits;
}

export function summarizeRun(run: Run): RunSummary {
  const ledger = run.ledger.filter((r) => r.nodePath !== SUPERVISOR_PATH);
  const events = run.events.filter((e) => e.node !== SUPERVISOR_PATH && !e.type.startsWith("supervisor_"));
  const costUsd = ledger.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const tokens = ledger.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.inputTokens == null ? (r.totalTokens ?? 0) : 0), 0);
  const cacheTokens = ledger.reduce((s, r) => s + (r.cacheReadTokens ?? 0) + (r.cacheWrite5mTokens ?? 0) + (r.cacheWrite1hTokens ?? 0), 0);
  const wallByNode = nodeWallTimes(events);
  const startedAt = events[0] ? ms(events[0].at) : 0;
  const endEvent = [...events].reverse().find((e) => RUN_END.has(e.type)) ?? events.at(-1);
  const wallMs = endEvent ? Math.max(0, ms(endEvent.at) - startedAt) : 0;
  const nodeTime = [...wallByNode.values()].reduce((s, v) => s + v, 0);
  const visitsByNode = new Map<string, number>();
  for (const event of events) if (event.type === "node_started" && typeof event.node === "string") visitsByNode.set(event.node, (visitsByNode.get(event.node) ?? 0) + 1);
  const failuresByNode = new Map<string, number>();
  const failures: RunSummary["failures"] = [];
  for (const event of events) {
    if (!["agent_failed", "node_failed", "run_failed"].includes(event.type)) continue;
    const node = typeof event.node === "string" ? event.node : null;
    failures.push({ node, agentId: typeof event.agentId === "string" ? event.agentId : null, error: text(event.error).slice(0, 500) });
    if (node) failuresByNode.set(node, (failuresByNode.get(node) ?? 0) + 1);
  }
  const paths = [...new Set([...ledger.map((r) => r.nodePath), ...visitsByNode.keys()])];
  const nodes = paths.map((node): NodeSummary => {
    const records = ledger.filter((r) => r.nodePath === node);
    const cost = records.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const input = records.reduce((s, r) => s + (r.inputTokens ?? 0), 0);
    const output = records.reduce((s, r) => s + (r.outputTokens ?? 0), 0);
    const wall = wallByNode.get(node) ?? records.reduce((s, r) => s + (r.durationMs ?? 0), 0);
    return {
      node,
      kind: kindOf(records),
      tier: single(records.map((r) => r.tier)),
      model: single(records.map((r) => r.model)),
      visits: visitsByNode.get(node) ?? 0,
      calls: records.length,
      agents: [...new Set(records.map((r) => r.agentId).filter((a): a is string => typeof a === "string"))],
      costUsd: round(cost),
      costShare: costUsd > 0 ? round(cost / costUsd, 3) : 0,
      tokens: input + output,
      inputTokens: input,
      outputTokens: output,
      wallMs: wall,
      timeShare: nodeTime > 0 ? round(wall / nodeTime, 3) : 0,
      failures: failuresByNode.get(node) ?? 0,
    };
  }).sort((a, b) => b.costUsd - a.costUsd || b.wallMs - a.wallMs || a.node.localeCompare(b.node));
  const questions = questionWaits(events);
  const budgetUsd = run.config?.budget.maxCostUsd ?? run.proposal?.budget.maxCostUsd ?? null;
  const slowest = [...nodes].sort((a, b) => b.wallMs - a.wallMs)[0];
  const longest = [...questions].filter((q) => q.waitMs !== null).sort((a, b) => (b.waitMs ?? 0) - (a.waitMs ?? 0))[0];
  return {
    run: { runId: run.runId, workflow: run.workflow ?? "hello", goal: run.goal, status: run.status, backend: backendLabel(run), tierModels: { ...(run.config?.tiers ?? {}) }, budgetUsd },
    totals: {
      costUsd: round(costUsd),
      budgetRatio: budgetUsd ? round(costUsd / budgetUsd, 3) : null,
      tokens,
      cacheTokens,
      llmSteps: ledger.filter((r) => r.kind === "llm").length,
      scriptSteps: ledger.filter((r) => r.kind === "script").length,
      unknownCostSteps: ledger.filter((r) => r.kind === "llm" && r.costSource === "unknown").length,
      wallMs,
      agentMs: ledger.reduce((s, r) => s + (r.durationMs ?? 0), 0),
    },
    nodes,
    loops: nodes.filter((n) => n.visits > 1).map((n) => ({ node: n.node, visits: n.visits })),
    failures,
    questions,
    clientWaits: clientWaits(events),
    skipped: events.filter((e) => e.type === "node_skipped").map((e) => ({ node: text(e.node), reason: text(e.reason) })),
    budget: events.filter((e) => e.type === "budget_threshold" || e.type === "budget_exceeded").map((e) => ({ level: e.type === "budget_exceeded" ? "exceeded" : text(e.level), ratio: Number(e.ratio ?? 0) })),
    top: { costNode: nodes[0] && nodes[0].costUsd > 0 ? nodes[0].node : null, timeNode: slowest && slowest.wallMs > 0 ? slowest.node : null, longestQuestion: longest?.questionId ?? null },
  };
}

export interface SupervisorVerdict {
  verdict: string;
  bottleneck: string;
  idea: string;
}

export function parseSupervisorLine(output: string): SupervisorVerdict | null {
  const line = output.trim().split(/\r?\n/).reverse().find((l) => /^\s*`?supervise\s*\|/.test(l));
  if (!line) return null;
  const parts = line.replace(/`/g, "").split("|").map((p) => p.trim());
  const [, verdict = "", bottleneck = "", ...idea] = parts;
  if (!["ok", "improve", "fix"].includes(verdict)) return null;
  return { verdict, bottleneck, idea: idea.join(" | ") };
}
