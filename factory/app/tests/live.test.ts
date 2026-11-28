import { isLive, liveState } from "../src/live.ts";
import type { Item, RunData } from "../src/types.ts";
import { runWith } from "./test-utils/data.ts";

const at = "2026-11-12T00:00:00Z";

function run(status: string, events: RunData["events"], extra: Partial<RunData> = {}): RunData {
  return runWith(events, { status, ...extra });
}

test("a running run shows the started node and only the agents that have not finished", () => {
  const live = liveState(run("running", [
    { at, type: "node_started", node: "wf/task" },
    { at, type: "node_completed", node: "wf/task" },
    { at, type: "node_started", node: "wf/workers" },
    { at, type: "agent_started", node: "wf/workers", agentId: "flow" },
    { at, type: "agent_started", node: "wf/workers", agentId: "test" },
    { at, type: "agent_completed", node: "wf/workers", agentId: "flow" },
  ]));
  expect(live).toEqual({ node: "wf/workers", agents: ["wf/workers#test"], waiting: null });
});

test("a finished run shows nothing as live", () => {
  expect(liveState(run("done", [{ at, type: "node_started", node: "wf/task" }]))).toEqual({ node: null, agents: [], waiting: null });
});

test("a run waiting for the user points at the question node", () => {
  const live = liveState(run("waiting_for_user", [{ at, type: "node_started", node: "wf/ask-commit" }], { pendingQuestion: { id: "q-impl-commit", text: "?", node: "wf/ask-commit" } }));
  expect(live.node).toBe("wf/ask-commit");
  expect(live.waiting).toBe("wf/ask-commit");
});

test("delegate work items count as working agents", () => {
  const live = liveState(run("waiting_for_client", [{ at, type: "node_started", node: "wf/audit" }], { pendingWorkItems: [{ nodePath: "wf/audit", agentId: "dotnet" }] }));
  expect(live.agents).toEqual(["wf/audit#dotnet"]);
});

const lensesNode = { id: "lenses", kind: "llm" };

function lens(id: string): Item {
  return { key: `wf/review/lenses#${id}`, kind: "agent", node: lensesNode, nodePath: "wf/review/lenses", agent: { id, role: "lens" } };
}

test.each<{ name: string; item: Item; live: boolean }>([
  { name: "a call is live while a node inside it runs", item: { key: "wf/review", kind: "subgraph", node: { id: "review", kind: "call", workflow: "olko-review" }, inner: { items: [], edges: [] } }, live: true },
  { name: "a step outside the running node is not live", item: { key: "wf/scope-gate", kind: "step", node: { id: "scope-gate", kind: "script" } }, live: false },
  { name: "an agent card is live while it works", item: lens("bugs"), live: true },
  { name: "an agent card that does not work is not live", item: lens("dotnet"), live: false },
])("$name", ({ item, live }) => {
  const state = liveState(run("running", [
    { at, type: "node_started", node: "wf/review/review-scope" },
    { at, type: "agent_started", node: "wf/review/lenses", agentId: "bugs" },
  ]));
  expect(isLive(item, state)).toBe(live);
});
