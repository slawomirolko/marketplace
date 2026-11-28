import test from "node:test";
import assert from "node:assert/strict";
import { runReport, subgraphCosts } from "../src/run-report.ts";
import type { NodeCost, Run, WorkflowSpec } from "../src/types.ts";

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

test("subgraph costs: a group's cost includes its multi-agent nodes", () => {
  const groupSpecs = [
    spec("root", [{ id: "phase", kind: "group", workflow: "inner" }]),
    spec("inner", [{ id: "workers", kind: "llm", agents: [{ id: "flow" }, { id: "test" }] }, { id: "gate", kind: "script" }]),
  ];
  const costs = subgraphCosts(groupSpecs, "root", { "root/workers": nodeCost(0.25), "root/gate": nodeCost(0, "none", { llmSteps: 0 }) });
  assert.equal(costs["root/phase"]?.costUsd, 0.25);
});

/** A done hello run with one measured step and two unknown ones, one of them on a model with no known step. */
function partlyUnknownRun(): Run {
  const ledgerRecord = (nodePath: string, model: string, costUsd: number | null, costSource: string) => ({ nodePath, agentId: nodePath.split("/").at(-1), kind: "llm", tier: "medium", model, inputTokens: 10, outputTokens: 1, costUsd, costSource });
  return {
    runId: "r-0000abcd",
    status: "done",
    workflow: "hello",
    config: { tiers: { medium: "m" }, backend: { kind: "delegate" }, budget: { maxCostUsd: 1 } },
    proposal: { budget: { maxCostUsd: 1 } },
    steps: 3,
    thresholdsHit: [],
    ledger: [ledgerRecord("hello/plan", "known", 0.25, "measured"), ledgerRecord("hello/build/implement", "known", null, "unknown"), ledgerRecord("hello/build/verify", "lost", null, "unknown")],
  } as unknown as Run;
}

test("run report: totals with unknown steps keep the known amount and count the unknown steps", () => {
  const report = runReport(partlyUnknownRun());
  assert.equal(report.cost.costUsd, 0.25);
  assert.deepEqual(report.coverage.run, { llmSteps: 3, unknownSteps: 2 });
  assert.deepEqual([report.byModel.lost, report.coverage.byModel.lost], [0, { llmSteps: 1, unknownSteps: 1 }], "a model with only unknown steps has no known amount");
  assert.deepEqual([report.byModel.known, report.coverage.byModel.known], [0.25, { llmSteps: 2, unknownSteps: 1 }]);
  assert.deepEqual([report.byTier.medium, report.coverage.byTier.medium], [0.25, { llmSteps: 3, unknownSteps: 2 }]);
});

test("subgraph costs: a subgraph whose LLM steps are all unknown is unknown, not $0", () => {
  const helloSpecs = [spec("hello", [{ id: "plan", kind: "llm" }, { id: "build", kind: "subgraph", workflow: "build" }]), spec("build", [{ id: "implement", kind: "llm" }, { id: "verify", kind: "llm" }])];
  const build = subgraphCosts(helloSpecs, "hello", runReport(partlyUnknownRun()).byNode)["hello/build"];
  assert.deepEqual([build?.costSource, build?.llmSteps, build?.unknownSteps], ["unknown", 2, 2]);
});
