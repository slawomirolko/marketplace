import { agentScripts, buildLevel, containedWorkflows, END_KEY, hasMemoryLayer, isEngineScript, START_KEY } from "../src/tree.ts";
import type { Item, Level, Workflow } from "../src/types.ts";
import { agentInfo } from "./test-utils/data.ts";

function itemAt(level: Level, key: string): Item {
  const item = level.items.find((candidate) => candidate.key === key);
  if (!item) {
    throw new Error(`no item ${key}`);
  }
  return item;
}

function workflow(name: string, entry: string, nodes: Workflow["nodes"], edges: Workflow["edges"] = []): Workflow {
  return { name, version: "1", entry, nodes, edges };
}

test("a subgraph that points back to a running workflow is shown as missing", () => {
  const level = buildLevel([workflow("a", "x", [{ id: "x", kind: "subgraph", workflow: "a" }])], "a");
  expect(level.items.map((item) => item.key)).toEqual([START_KEY, "a/x", END_KEY]);
  expect(level.items[1]?.kind).toBe("missing");
});

test("an unknown root workflow is an error, not an empty graph", () => {
  expect(() => buildLevel([], "nope")).toThrow(/workflow 'nope' not found/);
});

/** A root with a marked step, a mixed team, a subgraph, a step whose agents come from state and an engine script. */
function memoryLevel(): Level {
  return buildLevel(
    [
      workflow(
        "main",
        "run",
        [
          { id: "run", kind: "llm", agent: "keeper" },
          { id: "team", kind: "llm", agents: [{ id: "a", agent: "keeper" }, { id: "b", agent: "plain" }, { id: "c" }] },
          { id: "sub", kind: "subgraph", workflow: "child" },
          { id: "dynamic", kind: "llm", agentsFrom: "state.run.agents" },
          { id: "stop", kind: "script", op: "builtin.stop" },
        ],
        [{ from: "run", to: "team" }, { from: "team", to: "sub" }, { from: "sub", to: "dynamic" }, { from: "dynamic", to: "stop" }, { from: "stop", to: "END" }],
      ),
      workflow("child", "inner", [{ id: "inner", kind: "llm", agent: "keeper" }], [{ from: "inner", to: "END" }]),
    ],
    "main",
  );
}

const memoryAgents = { keeper: agentInfo("keeper", { memoryLayer: true }), plain: agentInfo("plain", { memoryLayer: false }) };

test("an agent step and each team member show the memory mark of their own agent", () => {
  const level = memoryLevel();
  const team = itemAt(level, "main/team");
  expect(hasMemoryLayer(itemAt(level, "main/run"), memoryAgents)).toBe(true);
  expect(team.kind === "team" ? team.inner.items.map((member) => hasMemoryLayer(member, memoryAgents)) : null).toEqual([true, false, false]);
  expect(hasMemoryLayer(itemAt(level, "main/run"), {}), "an unknown agent has no mark").toBe(false);
});

test("a team, subgraph, state-driven step or script never shows the memory mark, even when a child has it", () => {
  const level = memoryLevel();
  const sub = itemAt(level, "main/sub");
  expect(hasMemoryLayer(itemAt(level, "main/team"), memoryAgents), "a team is not marked although its member a has the memory layer").toBe(false);
  expect(sub.kind === "subgraph" ? sub.inner.items.filter((item) => item.kind === "step").map((item) => hasMemoryLayer(item, memoryAgents)) : null, "the agent inside the subgraph is marked").toEqual([true]);
  expect(hasMemoryLayer(sub, memoryAgents), "a subgraph is not marked although its agent has the memory layer").toBe(false);
  expect(hasMemoryLayer(itemAt(level, "main/dynamic"), memoryAgents), "a step whose agents come from state names no agent").toBe(false);
  expect(hasMemoryLayer(itemAt(level, "main/stop"), memoryAgents), "an engine script is never marked").toBe(false);
});

test("an agent's skill scripts belong to its step or team member; a script step is an engine script", () => {
  const syncer = agentInfo("syncer", { scripts: [{ skill: "sync", name: "sync.mjs", file: "skills/demo/sync/scripts/sync.mjs" }] });
  const level = buildLevel(
    [
      workflow(
        "main",
        "run",
        [{ id: "run", kind: "llm", agent: "syncer" }, { id: "team", kind: "llm", agents: [{ id: "a", agent: "syncer" }, { id: "b" }] }, { id: "stop", kind: "script", op: "builtin.stop" }],
        [{ from: "run", to: "team" }, { from: "team", to: "stop" }, { from: "stop", to: "END" }],
      ),
    ],
    "main",
  );
  const team = itemAt(level, "main/team");
  const members = team.kind === "team" ? team.inner.items : [];
  const scriptNames = (item: Item | undefined) => (item ? agentScripts(item, { syncer }).map((script) => script.name) : null);
  expect(scriptNames(itemAt(level, "main/run"))).toEqual(["sync.mjs"]);
  expect(scriptNames(members[0])).toEqual(["sync.mjs"]);
  expect(scriptNames(members[1])).toEqual([]);
  expect(scriptNames(itemAt(level, "main/stop"))).toEqual([]);
  expect(isEngineScript(itemAt(level, "main/stop"))).toBe(true);
  expect(isEngineScript(itemAt(level, "main/run"))).toBe(false);
});

test("a run contains its own workflow and every part it inlines or calls, at any depth", () => {
  const workflows = [
    workflow("impl", "review", [{ id: "review", kind: "call", workflow: "review" }, { id: "entry", kind: "group", workflow: "impl-entry" }]),
    workflow("impl-entry", "plan", [{ id: "plan", kind: "call", workflow: "plan" }]),
    workflow("plan", "gate", [{ id: "gate", kind: "call", workflow: "plan-gate" }]),
    workflow("plan-gate", "", []),
    workflow("review", "", []),
    workflow("sync", "", []),
  ];
  expect([...containedWorkflows(workflows, "impl")].sort()).toEqual(["impl", "impl-entry", "plan", "plan-gate", "review"]);
  expect(containedWorkflows(workflows, "sync").has("review")).toBe(false);
});
