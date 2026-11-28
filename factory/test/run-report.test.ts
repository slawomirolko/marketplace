import test from "node:test";
import assert from "node:assert/strict";
import { subgraphCosts } from "../src/run-report.ts";
import { runTimeline } from "../src/run-timing.ts";
import type { LedgerRecord, NodeCost, Run, RunEvent, WorkflowSpec } from "../src/types.ts";

function nodeCost(costUsd: number, costSource = "measured", extra: Partial<NodeCost> = {}): NodeCost {
  return { costUsd, tokens: 10, cacheTokens: 2, steps: 1, llmSteps: 1, unknownSteps: costSource === "unknown" ? 1 : 0, costSource, tier: "low", model: "m", byAgent: {}, ...extra };
}

function spec(name: string, nodes: WorkflowSpec["nodes"]): WorkflowSpec {
  return { name, version: "1", entry: nodes[0]?.id ?? "", nodes, edges: [] };
}

const specs: WorkflowSpec[] = [
  spec("root", [
    { id: "plan", kind: "llm" },
    { id: "build", kind: "subgraph", workflow: "build" },
    { id: "phase", kind: "group", workflow: "phase" },
    { id: "again", kind: "call", workflow: "root" },
    { id: "lost", kind: "map", workflow: "nowhere" },
  ]),
  spec("build", [{ id: "compile", kind: "llm" }, { id: "test", kind: "script" }]),
  spec("phase", [{ id: "write", kind: "llm" }, { id: "inner", kind: "group", workflow: "inner" }]),
  spec("inner", [{ id: "check", kind: "llm" }]),
];

test("subgraph costs: a subgraph sums its own path, a group the nodes it draws, at any depth", () => {
  const byNode = {
    "root/plan": nodeCost(0.1),
    "root/build/compile": nodeCost(0.2),
    "root/build/test": nodeCost(0, "none", { llmSteps: 0 }),
    "root/write": nodeCost(0.3, "harness"),
    "root/check": nodeCost(0.0000004, "unknown"),
  };
  assert.deepEqual(subgraphCosts(specs, "root", byNode), {
    "root/build": { costUsd: 0.2, tokens: 20, cacheTokens: 4, steps: 2, llmSteps: 1, unknownSteps: 0, costSource: "mixed" },
    "root/inner": { costUsd: 0, tokens: 10, cacheTokens: 2, steps: 1, llmSteps: 1, unknownSteps: 1, costSource: "unknown" },
    "root/phase": { costUsd: 0.3, tokens: 20, cacheTokens: 4, steps: 2, llmSteps: 2, unknownSteps: 1, costSource: "mixed" },
  });
});

test("subgraph costs leave out subgraphs with no cost, cycles, missing workflows and other roots", () => {
  assert.deepEqual(subgraphCosts(specs, "root", { "root/plan": nodeCost(0.1) }), {});
  assert.deepEqual(subgraphCosts(specs, "nope", { "root/build/compile": nodeCost(0.1) }), {});
  assert.equal(subgraphCosts(specs, "root", { "root/again/plan": nodeCost(0.1) })["root/again"], undefined, "a call back into an open workflow is not drawn as a subgraph");
});

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
