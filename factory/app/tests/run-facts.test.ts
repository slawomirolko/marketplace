import { costOf, failureOf, itemPasses, ranIn, rawFailureOf, runCalls, runCount, runPasses, timeSpent } from "../src/run-facts.ts";
import { buildLevel, START_KEY } from "../src/tree.ts";
import type { Item, Workflow } from "../src/types.ts";
import { report as sampleReport, reportWith, runWith, timedCall, timedPass } from "./testUtils/data.ts";

function step(key: string, kind = "llm"): Item {
  return { key, kind: "step", node: { id: key.split("/").at(-1) ?? key, kind } };
}

const reviewNode = { id: "review", kind: "llm" };

function agent(id: string, nodePath = "w/review"): Item {
  return { key: `${nodePath}#${id}`, kind: "agent", node: reviewNode, agent: { id, role: undefined }, nodePath };
}

const team: Item = { key: "w/review", kind: "team", node: reviewNode, inner: { items: [], edges: [] } };
const terminal: Item = { key: START_KEY, kind: "terminal", label: "start" };

function group(key: string, inner: Item[]): Item {
  return { key, kind: "subgraph", node: { id: key.split("/").at(-1) ?? key, kind: "subgraph", workflow: "b" }, inner: { items: inner, edges: [] } };
}

const buildStep = step("hello/build");

function failedWith(error: string) {
  return runWith([{ at: "", type: "node_failed", node: "hello/build", error }]);
}

test.each([
  { name: "a JSON error is shown as type, status and message", error: '{"type":"http","status":429,"message":"rate limited"}', text: "http 429: rate limited" },
  { name: "truncated JSON keeps type and status", error: '{"type":"http","status":500', text: "http 500" },
  { name: "plain text is shown as is", error: "boom", text: "boom" },
  { name: "a number is shown as it is", error: "404", text: "404" },
  { name: "a boolean is shown as it is", error: "true", text: "true" },
  { name: "JSON with no type, status or message is shown as it is", error: '{"code":"E_LIMIT"}', text: '{"code":"E_LIMIT"}' },
])("$name", ({ error, text }) => {
  expect(failureOf(buildStep, failedWith(error))).toBe(text);
});

test("the raw error text stays available next to the readable one", () => {
  const raw = '{"type":"http","status":429,"message":"rate limited","retry":3}';
  expect(rawFailureOf(buildStep, failedWith(raw))).toBe(raw);
});

test("a group shows a failure of any node inside it", () => {
  const build = group("hello/build", []);
  expect(failureOf(build, runWith([{ at: "", type: "node_failed", node: "hello/build/verify", error: "boom" }]))).toBe("boom");
});

test("the viewer reads passes and calls from the run report instead of working them out", () => {
  const report = reportWith({ passes: [timedPass("hello/a", 1, 5000)], calls: [timedCall("hello/a", null, 5000)] });
  expect(runPasses(report)).toBe(report.passes);
  expect(runCalls(report)).toBe(report.calls);
  expect([runPasses(null), runCalls(null)]).toEqual([[], []]);
});

/** A retry loop of three visits, a subgraph of two steps (one visited twice) and a team visited twice, docs working both times. */
const retryRun = runWith([
  { at: "1", type: "node_started", node: "w/fix", visit: 1 },
  { at: "2", type: "node_started", node: "w/fix", visit: 2 },
  { at: "3", type: "node_started", node: "w/fix", visit: 3 },
  { at: "4", type: "node_started", node: "w/build/compile", visit: 1 },
  { at: "5", type: "node_started", node: "w/build/test", visit: 1 },
  { at: "6", type: "node_started", node: "w/build/test", visit: 2 },
  { at: "7", type: "node_started", node: "w/review", visit: 1 },
  { at: "8", type: "agent_started", node: "w/review", agentId: "docs" },
  { at: "9", type: "agent_started", node: "w/review", agentId: "code" },
  { at: "10", type: "node_started", node: "w/review", visit: 2 },
  { at: "11", type: "agent_started", node: "w/review", agentId: "docs" },
]);

const retryReport = reportWith({ passes: [], calls: [timedCall("w/review", "lint", 1000), timedCall("w/review", "lint", 1000)] });

test.each<{ name: string; item: Item; runs: number | null }>([
  { name: "three visits of the retry loop", item: step("w/fix"), runs: 3 },
  { name: "a step that never started shows 0", item: step("w/plan"), runs: 0 },
  { name: "a plain step does not count paths below its key", item: step("w/build"), runs: 0 },
  { name: "a group sums the step runs inside it", item: group("w/build", [step("w/build/compile"), step("w/build/test")]), runs: 3 },
  { name: "a team counts its own visits", item: team, runs: 2 },
  { name: "an agent counts its own starts", item: agent("docs"), runs: 2 },
  { name: "an agent that started once counts one", item: agent("code"), runs: 1 },
  { name: "an agent with no start event counts its calls in the report", item: agent("lint"), runs: 2 },
  { name: "terminals have no count", item: terminal, runs: null },
])("run count: $name", ({ item, runs }) => {
  expect(runCount(item, retryRun, retryReport)).toBe(runs);
});

test("run count: no run, no count", () => {
  expect(runCount(step("w/fix"), null, null)).toBeNull();
});

/**
 * The timed passes the backend serves for: fix (30 s), a question answered after 10 minutes, fix again (20 s), a
 * subgraph step (10 s), a team whose agents took 40 s and 50 s side by side, and an open script pass whose time
 * is the ledger durationMs.
 */
const timedReport = reportWith({
  passes: [
    timedPass("w/fix", 1, 30_000),
    timedPass("w/ask", 1, 1000, { waitMs: 600_000 }),
    timedPass("w/fix", 2, 20_000),
    timedPass("w/build/compile", 1, 10_000),
    timedPass("w/review", 1, 50_000),
    timedPass("w/script", 1, 840, { endedAt: null, status: "running" }),
  ],
  calls: [timedCall("w/fix", null, 30_000), timedCall("w/review", "docs", 40_000), timedCall("w/review", "code", 50_000)],
});

test.each<{ name: string; item: Item; ms: number | null }>([
  { name: "two passes of 30 s and 20 s add up", item: step("w/fix"), ms: 50_000 },
  { name: "the 10 minutes waiting for the answer are not step time", item: step("w/ask"), ms: 1000 },
  { name: "parallel agents: the team shows wall time, not the sum of its agents", item: team, ms: 50_000 },
  { name: "an agent's time is its own call", item: agent("docs"), ms: 40_000 },
  { name: "the other agent keeps its own time", item: agent("code"), ms: 50_000 },
  { name: "a group sums the steps inside it", item: group("w/build", [step("w/build/compile")]), ms: 10_000 },
  { name: "an open pass counts with the time the backend gave it", item: step("w/script", "script"), ms: 840 },
  { name: "a step that never ran has no time", item: step("w/plan"), ms: null },
  { name: "a terminal has no time", item: terminal, ms: null },
])("time spent: $name", ({ item, ms }) => {
  expect(timeSpent(item, timedReport)).toBe(ms);
});

test("time spent: each pass keeps its own duration and wait", () => {
  expect(itemPasses(step("w/fix"), timedReport).map((pass) => [pass.visit, pass.durationMs])).toEqual([[1, 30_000], [2, 20_000]]);
  expect(itemPasses(step("w/ask"), timedReport)[0]?.waitMs, "the wait is kept apart").toBe(600_000);
  expect(timeSpent(step("w/fix"), null), "no report, no time").toBeNull();
});

test("a step counts as run only when it started; an agent only when it worked", () => {
  const data = runWith([{ at: "", type: "node_started", node: "wf/workers" }, { at: "", type: "agent_started", node: "wf/workers", agentId: "flow" }], { status: "done" });
  expect(ranIn(step("wf/workers", "script"), data)).toBe(true);
  expect(ranIn(step("wf/stop-preflight", "script"), data)).toBe(false);
  expect(ranIn(agent("flow", "wf/workers"), data)).toBe(true);
  expect(ranIn(agent("test", "wf/workers"), data)).toBe(false);
});

test("a group's cost is the backend's subgraph cost for its key", () => {
  const workflows: Workflow[] = [
    { name: "root", version: "1", entry: "phase", nodes: [{ id: "phase", kind: "group", workflow: "inner" }], edges: [{ from: "phase", to: "END" }] },
    { name: "inner", version: "1", entry: "workers", nodes: [{ id: "workers", kind: "llm", agents: [{ id: "flow" }, { id: "test" }] }, { id: "gate", kind: "script" }], edges: [{ from: "workers", to: "gate" }, { from: "gate", to: "END" }] },
  ];
  const phaseCost = { costUsd: 0.25, tokens: 10, cacheTokens: 0, steps: 2, llmSteps: 1, unknownSteps: 0, costSource: "measured" };
  const report = reportWith({ bySubgraph: { "root/phase": phaseCost } });
  const phase = buildLevel(workflows, "root", "root", ["root"], report).items.find((item) => item.key === "root/phase");
  expect(phase ? costOf(phase, report) : null).toEqual(phaseCost);
  expect(phase ? costOf(phase, sampleReport) : undefined, "a group the backend gave no cost has none").toBeNull();
});
