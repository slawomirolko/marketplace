import { round } from "./run-report.ts";
import type { LedgerRecord, Run, RunEvent } from "./types.ts";

/** One agent inside a pass: from its agent_started or work_offered event to its completed or failed event. */
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
  /** Number of ledger records written while the pass was open. */
  records: number;
  /** Active time: start to end minus the time spent waiting for a user answer; the ledger durationMs sum when the pass has no end. */
  durationMs: number | null;
  /** Time inside the pass spent waiting for a user answer (a question or a budget pause). */
  waitMs: number;
}

/** One call in the calls list: a pass, or one agent of a pass when several agents ran in it. */
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

/** The passes and calls of a run, worked out from its events and ledger. */
export interface RunTimeline {
  passes: RunPass[];
  calls: RunCall[];
}

type TimelineRun = Pick<Run, "status" | "ledger" | "events">;

interface OpenPass extends Omit<RunPass, "records"> {
  records: LedgerRecord[];
}

interface Span {
  from: number;
  to: number;
}

const LIVE_STATUSES = new Set(["running", "waiting_for_user", "waiting_for_client"]);
const PASS_END = new Set(["node_completed", "node_failed", "node_skipped", "supervisor_completed", "supervisor_failed"]);

/** The passes and calls of a run with their active time, user-wait time and ledger cost. */
export function runTimeline(run: TimelineRun): RunTimeline {
  const passes = computePasses(run);
  return {
    passes: passes.map((pass) => ({ ...pass, records: pass.records.length })),
    calls: computeCalls(run, passes),
  };
}

function computePasses(run: TimelineRun): OpenPass[] {
  const passes: OpenPass[] = [];
  const open = new Map<string, OpenPass>();
  for (const event of run.events) {
    if (typeof event.node !== "string") {
      continue;
    }
    if (event.type === "node_started" || event.type === "supervisor_started") {
      const pass: OpenPass = { node: event.node, visit: typeof event.visit === "number" ? event.visit : null, startedAt: event.at, endedAt: null, status: "running", agents: [], records: [], durationMs: null, waitMs: 0 };
      passes.push(pass);
      open.set(event.node, pass);
      continue;
    }
    const pass = open.get(event.node);
    if (!pass) {
      continue;
    }
    applyPassEvent(pass, event, open);
  }
  for (const record of run.ledger) {
    const pass = passes.findLast((candidate) => candidate.node === record.nodePath && candidate.startedAt <= record.at) ?? passes.find((candidate) => candidate.node === record.nodePath);
    pass?.records.push(record);
  }
  const waits = userWaits(run.events);
  for (const pass of passes) {
    const time = activeTime(pass.startedAt, pass.endedAt, waits);
    pass.durationMs = time.durationMs ?? summed(pass.records).durationMs;
    pass.waitMs = time.waitMs;
    for (const agent of pass.agents) {
      Object.assign(agent, activeTime(agent.startedAt, agent.endedAt, waits));
    }
  }
  return passes;
}

function applyPassEvent(pass: OpenPass, event: RunEvent, open: Map<string, OpenPass>): void {
  const agentId = typeof event.agentId === "string" ? event.agentId : undefined;
  if ((event.type === "agent_started" || event.type === "work_offered") && agentId) {
    if (!pass.agents.some((agent) => agent.id === agentId && agent.endedAt === null)) {
      pass.agents.push({ id: agentId, startedAt: event.at, endedAt: null, status: "running", durationMs: null, waitMs: 0 });
    }
  } else if (event.type === "agent_completed" || event.type === "agent_failed") {
    const agent = pass.agents.findLast((candidate) => candidate.id === agentId && candidate.endedAt === null);
    if (agent) {
      Object.assign(agent, { endedAt: event.at, status: endStatus(event.type, null) });
    }
  } else if (PASS_END.has(event.type)) {
    Object.assign(pass, { endedAt: event.at, status: endStatus(event.type, event.result) });
    open.delete(pass.node);
  }
}

function computeCalls(run: TimelineRun, passes: OpenPass[]): RunCall[] {
  const unfinished = LIVE_STATUSES.has(run.status) ? "running" : "unfinished";
  const shownStatus = (status: string) => (status === "running" ? unfinished : status);
  return passes.flatMap((pass): RunCall[] => {
    const recorded = [...new Set(pass.records.map((record) => record.agentId).filter((id): id is string => Boolean(id)))];
    if (pass.agents.length === 0 && recorded.length > 1) {
      return recorded.map((id) => {
        const records = pass.records.filter((record) => record.agentId === id);
        const total = summed(records);
        return { node: pass.node, agent: id, agentName: agentNameIn(records), visit: pass.visit, status: shownStatus(pass.status), startedAt: pass.startedAt, costUsd: total.costUsd, records: records.length, durationMs: total.durationMs, waitMs: 0 };
      });
    }
    const agentIds = new Set(pass.agents.map((agent) => agent.id));
    if (agentIds.size > 1) {
      return pass.agents.map((agent) => {
        const records = pass.records.filter((record) => record.agentId === agent.id);
        const total = summed(records);
        return { node: pass.node, agent: agent.id, agentName: agentNameIn(records), visit: pass.visit, status: shownStatus(agent.status), startedAt: agent.startedAt, costUsd: total.costUsd, records: records.length, durationMs: agent.durationMs ?? total.durationMs, waitMs: agent.waitMs };
      });
    }
    const total = summed(pass.records);
    const agent = pass.agents[0]?.id ?? pass.records.find((record) => record.agentId)?.agentId ?? null;
    return [{ node: pass.node, agent, agentName: agentNameIn(pass.records), visit: pass.visit, status: shownStatus(pass.status), startedAt: pass.startedAt, costUsd: total.costUsd, records: pass.records.length, durationMs: pass.durationMs, waitMs: pass.waitMs }];
  });
}

function agentNameIn(records: LedgerRecord[]): string | null {
  return records.find((record) => record.agentName)?.agentName ?? null;
}

function endStatus(type: string, result: unknown): string {
  if (type === "node_failed" || type === "agent_failed" || type === "supervisor_failed") {
    return "failed";
  }
  if (type === "node_skipped") {
    return "skipped";
  }
  if (typeof result === "string" && result.includes("skipped: switch off")) {
    return "switched off";
  }
  return "done";
}

function elapsed(from: string, to: string | null): number | null {
  if (!to) {
    return null;
  }
  const milliseconds = Date.parse(to) - Date.parse(from);
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

/** Spans in which the run stood still for the user: a question (needs_input) or a budget pause, each up to its run_resumed. */
function userWaits(events: RunEvent[]): Span[] {
  const spans: Span[] = [];
  let from: number | null = null;
  for (const event of events) {
    if (event.type === "needs_input" || (event.type === "budget_threshold" && event.level === "pause")) {
      from ??= Date.parse(event.at);
    } else if (event.type === "run_resumed" && from !== null) {
      spans.push({ from, to: Date.parse(event.at) });
      from = null;
    }
  }
  return spans;
}

function activeTime(from: string, to: string | null, waits: Span[]): { durationMs: number | null; waitMs: number } {
  const total = elapsed(from, to);
  if (total === null) {
    return { durationMs: null, waitMs: 0 };
  }
  const start = Date.parse(from);
  const end = start + total;
  const waitMs = waits.reduce((sum, wait) => sum + Math.max(0, Math.min(end, wait.to) - Math.max(start, wait.from)), 0);
  return { durationMs: total - waitMs, waitMs };
}

function summed(records: LedgerRecord[]): { costUsd: number | null; durationMs: number | null } {
  const costUsd = records.some((record) => record.costUsd == null) ? null : round(records.reduce((sum, record) => sum + (record.costUsd ?? 0), 0));
  const timed = records.filter((record) => typeof record.durationMs === "number");
  return { costUsd, durationMs: timed.length ? timed.reduce((sum, record) => sum + (record.durationMs ?? 0), 0) : null };
}
