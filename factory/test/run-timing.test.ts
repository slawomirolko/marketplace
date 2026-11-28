import test from "node:test";
import assert from "node:assert/strict";
import { runTimeline } from "../src/run-timing.ts";
import type { LedgerRecord, Run, RunEvent } from "../src/types.ts";

function event(seconds: number, type: string, extra: Partial<RunEvent> = {}): RunEvent {
  return { at: new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString(), type, ...extra };
}

function record(nodePath: string, seconds: number, costUsd: number | null, extra: Partial<LedgerRecord> = {}): LedgerRecord {
  return { at: event(seconds, "").at, nodePath, kind: "llm", costUsd, costSource: costUsd === null ? "unknown" : "measured", ...extra } as LedgerRecord;
}

test("run timeline: a pass leaves out the user wait and a budget pause, and counts its ledger records", () => {
  const run = {
    status: "done",
    events: [
      event(0, "node_started", { node: "w/ask", visit: 1 }),
      event(5, "needs_input", { node: "w/ask", questionId: "q" }),
      event(65, "run_resumed"),
      event(70, "budget_threshold", { level: "pause" }),
      event(100, "run_resumed"),
      event(110, "node_completed", { node: "w/ask" }),
      event(110, "supervisor_started", { node: "@supervisor" }),
      event(112, "supervisor_completed", { node: "@supervisor" }),
    ],
    ledger: [record("w/ask", 3, 0.1, { durationMs: 3000 }), record("w/ask", 108, 0.2), record("@supervisor", 111, 0.05)],
  } as unknown as Run;
  const { passes, calls } = runTimeline(run);
  assert.deepEqual(passes.map((pass) => [pass.node, pass.status, pass.durationMs, pass.waitMs, pass.records]), [["w/ask", "done", 20_000, 90_000, 2], ["@supervisor", "done", 2000, 0, 1]]);
  assert.deepEqual(calls.map((call) => [call.node, call.costUsd, call.records, call.durationMs, call.waitMs]), [["w/ask", 0.3, 2, 20_000, 90_000], ["@supervisor", 0.05, 1, 2000, 0]]);
});

/** The part of a run the timeline reads. */
function timelineRun(status: string, events: RunEvent[], ledger: LedgerRecord[] = []): Run {
  return { status, events, ledger } as unknown as Run;
}

test("run timeline: one finished pass is one call with its duration", () => {
  const { passes, calls } = runTimeline(timelineRun("failed", [event(0, "node_started", { node: "hello/a", visit: 1 }), event(5, "node_completed", { node: "hello/a" })]));
  assert.deepEqual(passes.map((pass) => [pass.node, pass.status, pass.durationMs, pass.records]), [["hello/a", "done", 5000, 0]]);
  assert.deepEqual(calls.map((call) => [call.node, call.agent, call.durationMs]), [["hello/a", null, 5000]]);
});

/** A retried fix (done, then failed), a switched-off step, a team with one unfinished agent and a last step still open. */
function callsRun(status: string): Run {
  return timelineRun(
    status,
    [
      event(0, "node_started", { node: "w/fix", visit: 1 }),
      event(2, "node_completed", { node: "w/fix", result: "ok" }),
      event(3, "node_started", { node: "w/fix", visit: 2 }),
      event(8, "node_failed", { node: "w/fix", error: "boom" }),
      event(9, "node_started", { node: "w/docs", visit: 1 }),
      event(9, "node_completed", { node: "w/docs", result: "skipped: switch off docs" }),
      event(10, "node_started", { node: "w/review", visit: 1 }),
      event(10, "agent_started", { node: "w/review", agentId: "docs" }),
      event(10, "agent_started", { node: "w/review", agentId: "code" }),
      event(14, "agent_completed", { node: "w/review", agentId: "docs" }),
      event(20, "node_started", { node: "w/last", visit: 1 }),
    ],
    [
      record("w/fix", 1, 0.25),
      record("w/fix", 7, 0.5),
      record("w/fix", 7.5, null),
      record("w/review", 13, 0.1, { agentId: "docs", agentName: "docs-writer", durationMs: 3000 }),
      record("w/review", 15, 0.2, { agentId: "code", durationMs: 5000 }),
    ],
  );
}

test("run calls: every visit in time order with status, ledger cost and duration", () => {
  const { calls } = runTimeline(callsRun("failed"));
  assert.deepEqual(
    calls.map((call) => [call.node, call.agent, call.visit, call.status, call.costUsd, call.durationMs]),
    [
      ["w/fix", null, 1, "done", 0.25, 2000],
      ["w/fix", null, 2, "failed", null, 5000],
      ["w/docs", null, 1, "switched off", 0, 0],
      ["w/review", "docs", 1, "done", 0.1, 4000],
      ["w/review", "code", 1, "unfinished", 0.2, 5000],
      ["w/last", null, 1, "unfinished", 0, null],
    ],
  );
  assert.equal(calls[1]?.records, 2, "ledger records go to the visit that was open when they were written");
  assert.equal(calls[3]?.agentName, "docs-writer");
});

test("run calls: a live run shows open calls as running", () => {
  assert.equal(runTimeline(callsRun("running")).calls.at(-1)?.status, "running");
});

test("run timeline: passes leave out user waits, a team pass is wall time and an open pass takes the ledger durationMs", () => {
  const { passes, calls } = runTimeline(
    timelineRun(
      "failed",
      [
        event(0, "node_started", { node: "w/fix", visit: 1 }),
        event(0, "work_offered", { node: "w/fix", agentId: "fix" }),
        event(30, "agent_completed", { node: "w/fix", agentId: "fix" }),
        event(30, "node_completed", { node: "w/fix" }),
        event(30, "node_started", { node: "w/ask", visit: 1 }),
        event(30, "needs_input", { node: "w/ask", questionId: "q" }),
        event(630, "run_resumed"),
        event(631, "node_completed", { node: "w/ask", result: "answered" }),
        event(631, "node_started", { node: "w/fix", visit: 2 }),
        event(631, "work_offered", { node: "w/fix", agentId: "fix" }),
        event(651, "agent_completed", { node: "w/fix", agentId: "fix" }),
        event(651, "node_completed", { node: "w/fix" }),
        event(651, "node_started", { node: "w/build/compile", visit: 1 }),
        event(661, "node_completed", { node: "w/build/compile" }),
        event(661, "node_started", { node: "w/review", visit: 1 }),
        event(661, "work_offered", { node: "w/review", agentId: "docs" }),
        event(661, "work_offered", { node: "w/review", agentId: "code" }),
        event(701, "agent_completed", { node: "w/review", agentId: "docs" }),
        event(711, "agent_completed", { node: "w/review", agentId: "code" }),
        event(711, "node_completed", { node: "w/review" }),
        event(711, "node_started", { node: "w/script", visit: 1 }),
      ],
      [record("w/script", 711, 0, { kind: "script", durationMs: 840 })],
    ),
  );
  assert.deepEqual(
    passes.map((pass) => [pass.node, pass.visit, pass.durationMs, pass.waitMs]),
    [
      ["w/fix", 1, 30_000, 0],
      ["w/ask", 1, 1000, 600_000],
      ["w/fix", 2, 20_000, 0],
      ["w/build/compile", 1, 10_000, 0],
      ["w/review", 1, 50_000, 0],
      ["w/script", 1, 840, 0],
    ],
  );
  assert.deepEqual(calls.filter((call) => call.node === "w/review").map((call) => [call.agent, call.durationMs]), [["docs", 40_000], ["code", 50_000]], "an agent runs from work_offered to agent_completed");
});
