import { agentsOnly } from "../src/agents-only.ts";
import { buildLevel, END_KEY, START_KEY } from "../src/tree.ts";
import type { Level, Workflow, WorkflowEdge, WorkflowNode } from "../src/types.ts";

const llm = (id: string): WorkflowNode => ({ id, kind: "llm", role: "r", agent: `agent-${id}` });
const script = (id: string): WorkflowNode => ({ id, kind: "script", op: "builtin.values" });
const ask = (id: string): WorkflowNode => ({ id, kind: "interrupt", question: { id, text: "?" } });
const sub = (id: string, workflow: string, extra: Partial<WorkflowNode> = {}): WorkflowNode => ({ id, kind: "subgraph", workflow, ...extra });

function wf(name: string, entry: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return { name, version: "1.0.0", entry, nodes, edges };
}

function reduced(workflows: Workflow[], root = "main"): Level {
  return agentsOnly(buildLevel(workflows, root));
}

function keys(level: Level): string[] {
  return level.items.map((i) => i.key);
}

/** The inner level of the subgraph `key`; fails when `key` is not a subgraph. */
function innerOf(level: Level, key: string): Level {
  const item = level.items.find((candidate) => candidate.key === key);
  if (item?.kind !== "subgraph") {
    throw new Error(`${key} is not a subgraph`);
  }
  return item.inner;
}

function links(level: Level): string[] {
  return level.edges.map((e) => `${e.from} ${e.dashed ? "-->" : "->"} ${e.to}`).sort();
}

test("hidden question steps are bridged by one solid link", () => {
  const level = reduced([wf("main", "a", [llm("a"), ask("s"), ask("q"), llm("b")], [{ from: "a", to: "s" }, { from: "s", to: "q" }, { from: "q", to: "b" }, { from: "b", to: "END" }])]);
  expect(keys(level)).toEqual([START_KEY, "main/a", "main/b", END_KEY]);
  expect(links(level)).toEqual([`${START_KEY} -> main/a`, "main/a -> main/b", `main/b -> ${END_KEY}`].sort());
});

test("start reaches the first agent through leading questions", () => {
  const level = reduced([wf("main", "s", [ask("s"), llm("a")], [{ from: "s", to: "a" }, { from: "a", to: "END" }])]);
  expect(links(level)).toEqual([`${START_KEY} -> main/a`, `main/a -> ${END_KEY}`].sort());
});

test("engine scripts stay as their own steps between the agents", () => {
  const level = reduced([wf("main", "s", [script("s"), llm("a"), ask("q"), script("t")], [{ from: "s", to: "a" }, { from: "a", to: "q" }, { from: "q", to: "t" }, { from: "t", to: "END" }])]);
  expect(keys(level)).toEqual([START_KEY, "main/s", "main/a", "main/t", END_KEY]);
  expect(links(level)).toEqual([`${START_KEY} -> main/s`, "main/s -> main/a", "main/a -> main/t", `main/t -> ${END_KEY}`].sort());
});

test("a container holding only an engine script stays", () => {
  const workflows = [
    wf("main", "a", [llm("a"), sub("gate", "inner")], [{ from: "a", to: "gate" }, { from: "gate", to: "END" }]),
    wf("inner", "s", [script("s")], [{ from: "s", to: "END" }]),
  ];
  const level = reduced(workflows);
  expect(keys(level)).toEqual([START_KEY, "main/a", "main/gate", END_KEY]);
  expect(keys(innerOf(level, "main/gate"))).toEqual(["main/gate/s"]);
});

test("a condition anywhere on a hidden path makes the link dashed", () => {
  const level = reduced([
    wf("main", "a", [llm("a"), ask("s"), llm("b"), llm("c")], [
      { from: "a", to: "s" },
      { from: "s", to: "b", when: 's.x == "1"' },
      { from: "s", to: "c" },
      { from: "b", to: "END" },
      { from: "c", to: "END" },
    ]),
  ]);
  expect(links(level)).toEqual([`${START_KEY} -> main/a`, "main/a --> main/b", "main/a --> main/c", `main/b -> ${END_KEY}`, `main/c -> ${END_KEY}`].sort());
});

test("a direct conditional edge keeps its label and is dashed", () => {
  const level = reduced([wf("main", "a", [llm("a"), llm("b")], [{ from: "a", to: "b", when: 'a.ok == "yes"' }, { from: "a", to: "END" }, { from: "b", to: "END" }])]);
  const edge = level.edges.find((e) => e.from === "main/a" && e.to === "main/b");
  expect(edge?.dashed).toBe(true);
  expect(edge?.label).toBe('a.ok == "yes"');
});

test("two branches to one agent give one link, dashed because both are branches", () => {
  const level = reduced([
    wf("main", "a", [llm("a"), ask("s"), ask("t"), llm("b")], [
      { from: "a", to: "s", when: 'a.x == "1"' },
      { from: "a", to: "t" },
      { from: "s", to: "b" },
      { from: "t", to: "b" },
      { from: "b", to: "END" },
    ]),
  ]);
  const ab = level.edges.filter((e) => e.from === "main/a" && e.to === "main/b");
  expect(ab.length).toBe(1);
  expect(ab[0]?.dashed).toBe(true);
});

test("a cycle through hidden steps ends and drops the self link", () => {
  const level = reduced([
    wf("main", "a", [llm("a"), ask("s"), ask("t"), llm("b")], [
      { from: "a", to: "s" },
      { from: "s", to: "t" },
      { from: "t", to: "s", when: 't.again == "yes"' },
      { from: "t", to: "a", when: 't.retry == "yes"' },
      { from: "t", to: "b" },
      { from: "b", to: "END" },
    ]),
  ]);
  expect(links(level)).toEqual([`${START_KEY} -> main/a`, "main/a --> main/b", `main/b -> ${END_KEY}`].sort());
});

test("a switchable subgraph is entered and skipped by dashed links; its inner agents stay inside", () => {
  const workflows = [
    wf("main", "a", [llm("a"), sub("opt", "inner", { enabledWhen: "switches.x == true" }), llm("c")], [{ from: "a", to: "opt" }, { from: "opt", to: "c" }, { from: "c", to: "END" }]),
    wf("inner", "s", [ask("s"), llm("x"), llm("y")], [{ from: "s", to: "x" }, { from: "x", to: "y" }, { from: "y", to: "END" }]),
  ];
  const level = reduced(workflows);
  expect(keys(level)).toEqual([START_KEY, "main/a", "main/opt", "main/c", END_KEY]);
  expect(links(level)).toEqual([`${START_KEY} -> main/a`, "main/a --> main/opt", "main/a --> main/c", "main/opt -> main/c", `main/c -> ${END_KEY}`].sort());
  expect(keys(innerOf(level, "main/opt"))).toEqual(["main/opt/x", "main/opt/y"]);
  expect(links(innerOf(level, "main/opt"))).toEqual(["main/opt/x -> main/opt/y"]);
});

test("a required switched subgraph is mandatory and has no skip link", () => {
  const workflows = [
    wf("main", "a", [llm("a"), sub("must", "inner", { enabledWhen: "switches.x == true", required: true }), llm("c")], [{ from: "a", to: "must" }, { from: "must", to: "c" }, { from: "c", to: "END" }]),
    wf("inner", "x", [llm("x")], [{ from: "x", to: "END" }]),
  ];
  expect(links(reduced(workflows))).toEqual([`${START_KEY} -> main/a`, "main/a -> main/must", "main/must -> main/c", `main/c -> ${END_KEY}`].sort());
});

test("a container left with only questions is dropped and the flow passes through it", () => {
  const workflows = [
    wf("main", "a", [llm("a"), sub("scripts", "inner"), llm("c")], [{ from: "a", to: "scripts" }, { from: "scripts", to: "c" }, { from: "c", to: "END" }]),
    wf("inner", "s", [ask("s"), ask("q")], [{ from: "s", to: "q" }, { from: "q", to: "END", when: 'q.go == "yes"' }, { from: "q", to: "FINISH" }]),
  ];
  const level = reduced(workflows);
  expect(keys(level)).toEqual([START_KEY, "main/a", "main/c", END_KEY]);
  expect(links(level)).toEqual([`${START_KEY} -> main/a`, "main/a --> main/c", `main/a --> ${END_KEY}`, `main/c -> ${END_KEY}`].sort());
});

test("teams and agentsFrom steps count as agents", () => {
  const team: WorkflowNode = { id: "team", kind: "llm", role: "r", agents: [{ id: "one" }, { id: "two" }] };
  const from: WorkflowNode = { id: "dyn", kind: "llm", role: "r", agentsFrom: "list.items" };
  const level = reduced([wf("main", "team", [team, ask("s"), from], [{ from: "team", to: "s" }, { from: "s", to: "dyn" }, { from: "dyn", to: "END" }])]);
  expect(keys(level)).toEqual([START_KEY, "main/team", "main/dyn", END_KEY]);
  expect(links(level)).toEqual([`${START_KEY} -> main/team`, "main/team -> main/dyn", `main/dyn -> ${END_KEY}`].sort());
});

test("the full level keeps every step and draws no dashed edge", () => {
  const level = buildLevel([wf("main", "a", [llm("a"), script("s")], [{ from: "a", to: "s", when: 'a.x == "1"' }, { from: "a", to: "END" }, { from: "s", to: "END" }])], "main");
  expect(keys(level)).toEqual([START_KEY, "main/a", "main/s", END_KEY]);
  expect(level.edges.filter((edge) => edge.dashed)).toEqual([]);
});

test("a loop through two switchable subgraphs ends", () => {
  const switchable = { enabledWhen: "input.on" };
  const workflows = [
    wf("main", "a", [llm("a"), sub("one", "inner-one", switchable), sub("two", "inner-two", switchable)], [{ from: "a", to: "one" }, { from: "one", to: "two" }, { from: "two", to: "one" }, { from: "two", to: "END" }]),
    wf("inner-one", "q", [ask("q")], [{ from: "q", to: "END" }]),
    wf("inner-two", "r", [ask("r")], [{ from: "r", to: "END" }]),
  ];
  const level = reduced(workflows);
  expect(links(level)).toContain(`main/a --> ${END_KEY}`);
});
