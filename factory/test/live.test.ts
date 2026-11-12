import test from "node:test";
import assert from "node:assert/strict";
import { isLive, liveState } from "../app/src/tree.ts";
import type { Item, RunData } from "../app/src/types.ts";

function run(status: string, events: RunData["events"], extra: Partial<RunData> = {}): RunData {
  return { runId: "r-1", goal: "g", status, ledger: [], events, ...extra };
}

const at = "2026-11-12T00:00:00Z";

test("a running run shows the started node and only the agents that have not finished", () => {
  const live = liveState(run("running", [
    { at, type: "node_started", node: "wf/task" },
    { at, type: "node_completed", node: "wf/task" },
    { at, type: "node_started", node: "wf/workers" },
    { at, type: "agent_started", node: "wf/workers", agentId: "flow" },
    { at, type: "agent_started", node: "wf/workers", agentId: "test" },
    { at, type: "agent_completed", node: "wf/workers", agentId: "flow" },
  ]));
  assert.deepEqual(live, { node: "wf/workers", agents: ["wf/workers#test"], waiting: null });
});

test("a finished run shows nothing as live", () => {
  const live = liveState(run("done", [{ at, type: "node_started", node: "wf/task" }]));
  assert.deepEqual(live, { node: null, agents: [], waiting: null });
});

test("a run waiting for the user points at the question node", () => {
  const live = liveState(run("waiting_for_user", [{ at, type: "node_started", node: "wf/ask-commit" }], { pendingQuestion: { id: "q-impl-commit", text: "?", node: "wf/ask-commit" } }));
  assert.equal(live.node, "wf/ask-commit");
  assert.equal(live.waiting, "wf/ask-commit");
});

test("delegate work items count as working agents", () => {
  const live = liveState(run("waiting_for_client", [{ at, type: "node_started", node: "wf/audit" }], { pendingWorkItems: [{ nodePath: "wf/audit", agentId: "dotnet" }] }));
  assert.deepEqual(live.agents, ["wf/audit#dotnet"]);
});

test("a call is live while a node inside it runs, and an agent card only when it works", () => {
  const live = liveState(run("running", [
    { at, type: "node_started", node: "wf/review/review-scope" },
    { at, type: "agent_started", node: "wf/review/lenses", agentId: "bugs" },
  ]));
  const call = { key: "wf/review", kind: "subgraph", node: { id: "review", kind: "call", workflow: "olko-review" }, inner: { items: [], edges: [] } } as unknown as Item;
  const other = { key: "wf/scope-gate", kind: "node", node: { id: "scope-gate", kind: "script" } } as unknown as Item;
  const bugs = { key: "wf/review/lenses#bugs", kind: "agent", nodePath: "wf/review/lenses", agent: { id: "bugs", role: "lens" } } as unknown as Item;
  const idle = { key: "wf/review/lenses#dotnet", kind: "agent", nodePath: "wf/review/lenses", agent: { id: "dotnet", role: "lens" } } as unknown as Item;
  assert.equal(isLive(call, live), true);
  assert.equal(isLive(other, live), false);
  assert.equal(isLive(bugs, live), true);
  assert.equal(isLive(idle, live), false);
});

test("a group's cost includes its multi-agent nodes", async () => {
  const { buildLevel, costOf } = await import("../app/src/tree.ts");
  const cost = (costUsd: number) => ({ costUsd, tokens: 10, cacheTokens: 0, steps: 1, llmSteps: 1, unknownSteps: 0, costSource: "measured", byAgent: {} });
  const workflows = [
    { name: "root", version: "1", entry: "phase", nodes: [{ id: "phase", kind: "group", workflow: "inner" }], edges: [{ from: "phase", to: "END" }] },
    { name: "inner", version: "1", entry: "workers", nodes: [{ id: "workers", kind: "llm", agents: [{ id: "flow" }, { id: "test" }] }, { id: "gate", kind: "script" }], edges: [{ from: "workers", to: "gate" }, { from: "gate", to: "END" }] },
  ];
  const report = { byNode: { "root/workers": cost(0.25), "root/gate": cost(0) } };
  const level = buildLevel(workflows as never, "root", "root", ["root"], report as never);
  const phase = level.items.find((i) => i.key === "root/phase")!;
  assert.equal(costOf(phase, report as never)?.costUsd, 0.25);
});

test("a step counts as run only when it started; an agent only when it worked", async () => {
  const { ranIn, mainAgentOf } = await import("../app/src/tree.ts");
  const data = run("done", [{ at, type: "node_started", node: "wf/workers" }, { at, type: "agent_started", node: "wf/workers", agentId: "flow" }]);
  const step = (key: string) => ({ key, kind: "step", node: { id: key, kind: "script" } }) as unknown as Item;
  const agent = (id: string) => ({ key: `wf/workers#${id}`, kind: "agent", nodePath: "wf/workers", agent: { id, role: "plan-worker" } }) as unknown as Item;
  assert.equal(ranIn(step("wf/workers"), data), true);
  assert.equal(ranIn(step("wf/stop-preflight"), data), false);
  assert.equal(ranIn(agent("flow"), data), true);
  assert.equal(ranIn(agent("test"), data), false);
  assert.equal(mainAgentOf({ source: "agents/opencode/olko-implementation-orchestrator.md (steps 1-11)" } as never), "olko-implementation-orchestrator");
  assert.equal(mainAgentOf({ source: "skills/*/olko-plan-editor" } as never), null);
});
