import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_HOSTS, callerFor } from "./helpers/data-api.ts";
import { tempDir } from "./helpers/temp.ts";
import { createDataApi, apiMiddleware } from "../src/viewer-data.ts";
import type { DataApi } from "../src/viewer-data.ts";
import type { Run } from "../src/types.ts";
import type { Cost, Item, Level, RunData, RunReport } from "../app/src/types.ts";
import { runTimeline } from "../src/run-timing.ts";
import { subgraphCosts } from "../src/run-report.ts";
import { supervisorRing } from "../app/src/supervisor.ts";
import { formatTokens, formatUsd } from "../app/src/format.ts";
import { humanIcons, humanLabel, questionsFor } from "../app/src/human.ts";
import { costOf, failureOf, ledgerOf, rawFailureOf, runCalls, runPasses } from "../app/src/run-facts.ts";
import { agentScripts, allItems, buildLevel, END_KEY, hasMemoryLayer, isEngineScript, START_KEY } from "../app/src/tree.ts";
import { agentsOnly } from "../app/src/agents-only.ts";
import { layoutGraph, scriptsHeight } from "../app/src/layout.ts";

function itemAt(level: Level, key: string): Item {
  const item = level.items.find((i) => i.key === key);
  assert.ok(item, `item ${key}`);
  return item;
}

function docsAgent(data: DataApi): Item {
  const review = itemAt(buildLevel(data.workflows(), "hello"), "hello/review");
  assert.ok(review.kind === "team");
  const docs = review.inner.items.find((i) => i.agent.id === "docs");
  assert.ok(docs);
  return docs;
}

function runWithEvents(events: RunData["events"]): RunData {
  return { runId: "r-00000000", goal: "", status: "failed", ledger: [], events };
}

/** The part of the run report that carries the timed passes and calls, as the backend serves it. */
function timelineReport(run: RunData): RunReport {
  return runTimeline(run as unknown as Run) as unknown as RunReport;
}

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(factoryDir, "spec", "examples", "valid", "factory-config.json");

function api(demo: boolean): DataApi {
  const dataDir = tempDir("factory-app-");
  return createDataApi({ factoryDir, dataDir, configFile, demo });
}

async function demoRun() {
  const data = api(true);
  await data.ensureDemo();
  const [summary] = data.runs();
  const detail = summary ? data.run(summary.runId) : null;
  assert.ok(detail, "the demo run has a detail");
  return { data, detail };
}

test("first start creates one finished demo run, later starts reuse it", async () => {
  const data = api(true);
  assert.equal(await data.ensureDemo(), true);
  assert.equal(await data.ensureDemo(), false);
  const runs = data.runs();
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.status, "done");
  assert.equal(runs[0]?.synthetic, true, "the demo run is marked as a fake model run");
  assert.ok((runs[0]?.costUsd ?? 0) > 0, `demo run cost ${runs[0]?.costUsd}`);
});

test("concurrent first requests wait for one finished demo run", async () => {
  const data = api(true);
  const request = async () => {
    const created = await data.ensureDemo();
    return { created, runs: data.runs() };
  };
  const results = await Promise.all([request(), request(), request()]);
  assert.equal(results.filter((r) => r.created).length, 1, "exactly one call creates the demo run");
  for (const { runs } of results) {
    assert.equal(runs.length, 1, "one demo run, not one per request");
    assert.equal(runs[0]?.status, "done", "every caller sees the finished run as soon as its call returns");
  }
});

test("a real data dir never gets a demo run", async () => {
  const data = api(false);
  assert.equal(await data.ensureDemo(), false);
  assert.deepEqual(data.runs(), []);
});

test("run ids are validated before any file is read", () => {
  const data = api(false);
  assert.equal(data.run("../../etc/passwd"), null);
  assert.equal(data.run("r-00000000"), null);
});

test("each of the four review agents has its own cost, and they add up to the node", async () => {
  const { detail } = await demoRun();
  const review = detail.report.byNode["hello/review"];
  assert.ok(review);
  const agents = Object.entries(review.byAgent);
  assert.deepEqual(agents.map(([id]) => id), ["security", "style", "tests", "docs"]);
  for (const [id, a] of agents) assert.ok(a.costUsd > 0 && a.tokens > 0 && a.steps === 1, `agent ${id}: ${JSON.stringify(a)}`);
  assert.equal(review.byAgent.docs?.tier, "low");
  assert.equal(review.tier, "mixed");
  const sum = agents.reduce((s, [, a]) => s + a.costUsd, 0);
  assert.ok(Math.abs(sum - review.costUsd) <= agents.length * 1e-6, `${sum} vs ${review.costUsd}`);
});

test("graph tree: subgraph and team are groups, terminals wrap the root level", async () => {
  const { data } = await demoRun();
  const level = buildLevel(data.workflows(), "hello");
  assert.deepEqual(level.items.map((i) => i.key), [START_KEY, "hello/plan", "hello/build", "hello/review", "hello/accountant", END_KEY]);
  const build = level.items.find((i) => i.key === "hello/build");
  const review = level.items.find((i) => i.key === "hello/review");
  assert.equal(build?.kind, "subgraph");
  assert.equal(review?.kind, "team");
  assert.ok(build?.kind === "subgraph");
  assert.deepEqual(build.inner.items.map((i) => i.key), ["hello/build/implement", "hello/build/verify"]);
  assert.ok(level.edges.some((e) => e.from === "hello/accountant" && e.to === END_KEY), "accountant leads to END");
  assert.ok(!build.inner.edges.some((e) => e.to === END_KEY), "inner END is not drawn");
});

test("a group's cost is the sum of its child nodes", async () => {
  const { data, detail } = await demoRun();
  const build = itemAt(buildLevel(data.workflows(), "hello"), "hello/build");
  const report = detail.report;
  const buildCost = costOf(build, report);
  assert.equal(buildCost?.costUsd, Math.round(((report.byNode["hello/build/implement"]?.costUsd ?? 0) + (report.byNode["hello/build/verify"]?.costUsd ?? 0)) * 1e6) / 1e6);
});

test("the run detail carries the subgraph costs, passes and calls the viewer shows", async () => {
  const { data, detail } = await demoRun();
  const report = detail.report;
  assert.deepEqual(Object.keys(report.bySubgraph), ["hello/build"]);
  assert.equal(report.bySubgraph["hello/build"]?.steps, (report.byNode["hello/build/implement"]?.steps ?? 0) + (report.byNode["hello/build/verify"]?.steps ?? 0));
  assert.deepEqual(report.passes.map((pass) => pass.node), detail.run.events.filter((e) => e.type === "node_started" || e.type === "supervisor_started").map((e) => e.node));
  assert.equal(report.calls.reduce((sum, call) => sum + call.records, 0), detail.run.ledger.length);
  const served = (await apiCall(data)("GET", `/api/runs/${detail.run.runId}`)).body as { report: Record<string, unknown> };
  assert.deepEqual(["bySubgraph", "passes", "calls"].filter((key) => key in served.report), ["bySubgraph", "passes", "calls"], "the API serves them with the report");
});

test("an agent's cost comes from its own entry in the node report", async () => {
  const { data, detail } = await demoRun();
  const docs = docsAgent(data);
  assert.equal(costOf(docs, detail.report), detail.report.byNode["hello/review"]?.byAgent.docs);
});

test("an agent's ledger records are only its own", async () => {
  const { data, detail } = await demoRun();
  const docs = docsAgent(data);
  assert.equal(ledgerOf(docs, detail.run).length, 1);
});

test("a group's ledger records include its child nodes' records", async () => {
  const { data, detail } = await demoRun();
  const build = itemAt(buildLevel(data.workflows(), "hello"), "hello/build");
  assert.equal(ledgerOf(build, detail.run).length, 5);
});

test("a subgraph that points back to a running workflow is shown as missing", () => {
  const workflows = [{ name: "a", version: "0.1.0", entry: "x", nodes: [{ id: "x", kind: "subgraph", workflow: "a" }], edges: [] }];
  const level = buildLevel(workflows, "a");
  assert.deepEqual(level.items.map((i) => i.key), [START_KEY, "a/x", END_KEY]);
  assert.equal(level.items[1]?.kind, "missing");
});

test("an unknown root workflow is an error, not an empty graph", () => {
  assert.throws(() => buildLevel([], "nope"), /workflow 'nope' not found/);
});

test("token counts show the cache part only when there is cache", () => {
  assert.equal(formatTokens(1234, undefined), "1,234 tok");
  assert.equal(formatTokens(1234, 5678), "1,234 tok + 5,678 cache");
  assert.equal(formatTokens(undefined, 0), "0 tok");
});

test("a JSON error from the run is shown as type, status and message", () => {
  const item: Item = { kind: "step", key: "hello/build", node: { id: "build", kind: "subgraph" } };
  const run = (error: string) => runWithEvents([{ at: "", type: "node_failed", node: "hello/build", error }]);
  assert.equal(failureOf(item, run('{"type":"http","status":429,"message":"rate limited"}')), "http 429: rate limited");
  assert.equal(failureOf(item, run('{"type":"http","status":500')), "http 500", "truncated JSON keeps type and status");
  assert.equal(failureOf(item, run("boom")), "boom", "plain text is shown as is");
});

test("an error text that parses to no type, status or message is shown as it is", () => {
  const item: Item = { kind: "step", key: "hello/build", node: { id: "build", kind: "subgraph" } };
  const run = (error: string) => runWithEvents([{ at: "", type: "node_failed", node: "hello/build", error }]);
  assert.equal(failureOf(item, run("404")), "404");
  assert.equal(failureOf(item, run("true")), "true");
  assert.equal(failureOf(item, run('{"code":"E_LIMIT"}')), '{"code":"E_LIMIT"}');
  assert.equal(rawFailureOf(item, run('{"type":"http","status":429,"message":"rate limited","retry":3}')), '{"type":"http","status":429,"message":"rate limited","retry":3}', "the raw text stays available");
});

test("the viewer reads passes and calls from the run report instead of working them out", () => {
  const report = timelineReport(runWithEvents([{ at: "2026-11-17T10:00:00.000Z", type: "node_started", node: "hello/a", visit: 1 }, { at: "2026-11-17T10:00:05.000Z", type: "node_completed", node: "hello/a" }]));
  assert.equal(runPasses(report), report.passes);
  assert.equal(runCalls(report), report.calls);
  assert.deepEqual(report.passes.map((pass) => [pass.node, pass.status, pass.durationMs, pass.records]), [["hello/a", "done", 5000, 0]]);
  assert.deepEqual([runPasses(null), runCalls(null)], [[], []]);
});

test("two edges between the same pair of nodes are drawn once with both labels", () => {
  const level: Level = {
    items: [
      { kind: "step", key: "main/a", node: { id: "a", kind: "llm" } },
      { kind: "step", key: "main/b", node: { id: "b", kind: "llm" } },
    ],
    edges: [
      { from: "main/a", to: "main/b", label: "when x" },
      { from: "main/a", to: "main/b", label: "when y", dashed: true },
    ],
  };
  const { edges } = layoutGraph(level, new Set());
  assert.equal(new Set(edges.map((edge) => edge.id)).size, edges.length, "edge ids are unique");
  assert.deepEqual(edges.map((edge) => edge.label), ["when x | when y"]);
});

test("a group shows a failure of any node inside it", () => {
  const group: Item = { kind: "subgraph", key: "hello/build", node: { id: "build", kind: "subgraph" }, inner: { items: [], edges: [] } };
  const run = runWithEvents([{ at: "", type: "node_failed", node: "hello/build/verify", error: "boom" }]);
  assert.equal(failureOf(group, run), "boom");
});

test("unknown cost is shown as unknown, missing cost as not run", () => {
  assert.equal(formatUsd({ costUsd: 0, costSource: "unknown" } as Cost), "unknown");
  assert.equal(formatUsd(null), "not run");
  assert.equal(formatUsd({ costUsd: 0.1234567, costSource: "measured" } as Cost), "$0.123457");
});

function apiCall(data: DataApi) {
  return callerFor(apiMiddleware(data, ALLOWED_HOSTS));
}

test("api returns the run list and a run detail as JSON", async () => {
  const { data, detail } = await demoRun();
  const call = apiCall(data);
  assert.equal(((await call("GET", "/api/runs")).body as unknown[]).length, 1);
  assert.equal(((await call("GET", `/api/runs/${detail.run.runId}`)).body as { report: { runId: string } }).report.runId, detail.run.runId);
});

test("api answers 404 for an unknown run id", async () => {
  const { data } = await demoRun();
  assert.equal((await apiCall(data)("GET", "/api/runs/nope")).status, 404);
});

test("a failing API read is logged with its path as well as answered with 500", async () => {
  const failing = { workflows: () => { throw new Error("workflows folder unreadable"); } } as unknown as DataApi;
  const logged: string[] = [];
  const original = console.error;
  console.error = (message: unknown) => logged.push(String(message));
  try {
    const result = await apiCall(failing)("GET", "/api/workflows");
    assert.equal(result.status, 500);
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, ["viewer API /api/workflows failed: workflows folder unreadable"]);
});

test("api passes non-GET requests and other paths on to the next handler", async () => {
  const { data } = await demoRun();
  const call = apiCall(data);
  assert.equal((await call("POST", "/api/runs")).status, "next");
  assert.equal((await call("GET", "/index.html")).status, "next");
});

test("totals with unknown steps are shown as unknown or partial, never as an exact amount", async () => {
  const { runReport } = await import("../src/run-report.ts");
  const { formatAmount, formatUsd } = await import("../app/src/format.ts");
  const record = (nodePath: string, model: string, costUsd: number | null, costSource: string) => ({ nodePath, agentId: nodePath.split("/").at(-1), kind: "llm", tier: "medium", model, inputTokens: 10, outputTokens: 1, costUsd, costSource });
  const run = {
    runId: "r-0000abcd",
    status: "done",
    workflow: "hello",
    config: { tiers: { medium: "m" }, backend: { kind: "delegate" }, budget: { maxCostUsd: 1 } },
    proposal: { budget: { maxCostUsd: 1 } },
    steps: 3,
    thresholdsHit: [],
    ledger: [record("hello/plan", "known", 0.25, "measured"), record("hello/build/implement", "known", null, "unknown"), record("hello/build/verify", "lost", null, "unknown")],
  } as unknown as Run;
  const report = runReport(run);
  assert.deepEqual(report.coverage.run, { llmSteps: 3, unknownSteps: 2 });
  assert.equal(formatAmount(report.cost.costUsd, report.coverage.run), "≥ $0.250000 (partial, 2 of 3 LLM steps unknown)");
  assert.equal(formatAmount(report.byModel.lost, report.coverage.byModel.lost), "unknown", "a model with only unknown steps is not $0");
  assert.equal(formatAmount(report.byModel.known, report.coverage.byModel.known), "≥ $0.250000 (partial, 1 of 2 LLM steps unknown)");
  assert.equal(formatAmount(report.byTier.medium, report.coverage.byTier.medium), "≥ $0.250000 (partial, 2 of 3 LLM steps unknown)");
  assert.equal(formatAmount(0.25, { llmSteps: 1, unknownSteps: 0 }), "$0.250000");
  const workflows = api(false).workflows();
  const build = itemAt(buildLevel(workflows, "hello"), "hello/build");
  const withSubgraphs = { ...report, bySubgraph: subgraphCosts(workflows, "hello", report.byNode) } as unknown as RunReport;
  assert.equal(formatUsd(costOf(build, withSubgraphs)), "unknown", "a subgraph whose LLM steps are all unknown is not $0");
});

test("run index gives the same cost, tier and failure as the per-node lookups", async () => {
  const { buildRunIndex, tierOf } = await import("../app/src/run-facts.ts");
  const { data, detail } = await demoRun();
  const config = data.config();
  const run = { ...detail.run, events: [...detail.run.events, { at: "", type: "node_failed", node: "hello/build/implement", error: "boom" }] };
  const level = buildLevel(data.workflows(), "hello", "hello", ["hello"], detail.report);
  const index = buildRunIndex(level, config, detail.report, run);
  const items: Item[] = [];
  const walk = (lvl: { items: Item[] }) => lvl.items.forEach((item) => { items.push(item); if ("inner" in item) walk(item.inner); });
  walk(level);
  assert.equal(index.size, items.length, "one entry per drawn item, including agents and subgraph children");
  for (const item of items) {
    const entry = index.get(item.key);
    assert.ok(entry, `index entry of ${item.key}`);
    assert.deepEqual(entry.cost, costOf(item, detail.report), `cost of ${item.key}`);
    assert.equal(entry.tier, tierOf(item, config, detail.report), `tier of ${item.key}`);
    assert.equal(entry.failure, failureOf(item, run), `failure of ${item.key}`);
  }
  assert.equal(index.get("hello/build")?.failure, "boom", "a failure inside a subgraph marks the subgraph");
  assert.equal(index.get("hello/review#docs")?.tier, "low");
});

function ledgerRecord(nodePath: string, at: string, costUsd: number | null, extra: Partial<RunData["ledger"][number]> = {}): RunData["ledger"][number] {
  return { runId: "r-00000000", workflow: "w@1", at, nodePath, kind: "llm", tier: "low", model: "m", backend: "fake", turn: 1, inputTokens: 1, outputTokens: 1, costUsd, costSource: costUsd === null ? "unknown" : "measured", ...extra };
}

test("run count: a step in a retry loop counts every visit, a group sums the steps inside it", async () => {
  const { runCount } = await import("../app/src/run-facts.ts");
  const step = (key: string): Item => ({ key, kind: "step", node: { id: key.split("/").at(-1) ?? key, kind: "llm" } });
  const run = runWithEvents([
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
  const group: Item = { key: "w/build", kind: "subgraph", node: { id: "build", kind: "subgraph", workflow: "b" }, inner: { items: [step("w/build/compile"), step("w/build/test")], edges: [] } };
  const reviewNode = { id: "review", kind: "llm" };
  const agent = (id: string): Item => ({ key: `w/review#${id}`, kind: "agent", node: reviewNode, agent: { id, role: undefined }, nodePath: "w/review" });
  const team: Item = { key: "w/review", kind: "team", node: reviewNode, inner: { items: [], edges: [] } };
  const report = timelineReport(run);
  assert.equal(runCount(step("w/fix"), run, report), 3, "three visits of the retry loop");
  assert.equal(runCount(step("w/plan"), run, report), 0, "a step that never started shows 0");
  assert.equal(runCount(step("w/build"), run, report), 0, "a plain step does not count paths below its key");
  assert.equal(runCount(group, run, report), 3, "a group sums the step runs inside it");
  assert.equal(runCount(team, run, report), 2, "a team counts its own visits");
  assert.equal(runCount(agent("docs"), run, report), 2, "an agent counts its own starts");
  assert.equal(runCount(agent("code"), run, report), 1);
  assert.equal(runCount({ key: START_KEY, kind: "terminal", label: "start" }, run, report), null, "terminals have no count");
  assert.equal(runCount(step("w/fix"), null, null), null, "no run, no count");
});

test("run calls: every visit in time order with status, ledger cost and duration", async () => {
  const run: RunData = {
    ...runWithEvents([
      { at: "2026-01-01T00:00:00.000Z", type: "node_started", node: "w/fix", visit: 1 },
      { at: "2026-01-01T00:00:02.000Z", type: "node_completed", node: "w/fix", result: "ok" },
      { at: "2026-01-01T00:00:03.000Z", type: "node_started", node: "w/fix", visit: 2 },
      { at: "2026-01-01T00:00:08.000Z", type: "node_failed", node: "w/fix", error: "boom" },
      { at: "2026-01-01T00:00:09.000Z", type: "node_started", node: "w/docs", visit: 1 },
      { at: "2026-01-01T00:00:09.000Z", type: "node_completed", node: "w/docs", result: "skipped: switch off docs" },
      { at: "2026-01-01T00:00:10.000Z", type: "node_started", node: "w/review", visit: 1 },
      { at: "2026-01-01T00:00:10.000Z", type: "agent_started", node: "w/review", agentId: "docs" },
      { at: "2026-01-01T00:00:10.000Z", type: "agent_started", node: "w/review", agentId: "code" },
      { at: "2026-01-01T00:00:14.000Z", type: "agent_completed", node: "w/review", agentId: "docs" },
      { at: "2026-01-01T00:00:20.000Z", type: "node_started", node: "w/last", visit: 1 },
    ]),
    ledger: [
      ledgerRecord("w/fix", "2026-01-01T00:00:01.000Z", 0.25),
      ledgerRecord("w/fix", "2026-01-01T00:00:07.000Z", 0.5),
      ledgerRecord("w/fix", "2026-01-01T00:00:07.500Z", null),
      ledgerRecord("w/review", "2026-01-01T00:00:13.000Z", 0.1, { agentId: "docs", agentName: "docs-writer", durationMs: 3000 }),
      ledgerRecord("w/review", "2026-01-01T00:00:15.000Z", 0.2, { agentId: "code", durationMs: 5000 }),
    ],
  };
  const { calls } = runTimeline(run as unknown as Run);
  assert.deepEqual(
    calls.map((c) => [c.node, c.agent, c.visit, c.status, c.costUsd, c.durationMs]),
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
  assert.equal(runTimeline({ ...run, status: "running" } as unknown as Run).calls.at(-1)?.status, "running", "a live run shows open calls as running");
});

test("time spent: passes add up, user waits are left out, a team counts wall time and a group sums its steps", async () => {
  const { itemPasses, runCalls, timeSpent } = await import("../app/src/run-facts.ts");
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1) + s * 1000).toISOString();
  const run: RunData = {
    ...runWithEvents([
      { at: at(0), type: "node_started", node: "w/fix", visit: 1 },
      { at: at(0), type: "work_offered", node: "w/fix", agentId: "fix" },
      { at: at(30), type: "agent_completed", node: "w/fix", agentId: "fix" },
      { at: at(30), type: "node_completed", node: "w/fix" },
      { at: at(30), type: "node_started", node: "w/ask", visit: 1 },
      { at: at(30), type: "needs_input", node: "w/ask", questionId: "q" },
      { at: at(630), type: "run_resumed" },
      { at: at(631), type: "node_completed", node: "w/ask", result: "answered" },
      { at: at(631), type: "node_started", node: "w/fix", visit: 2 },
      { at: at(631), type: "work_offered", node: "w/fix", agentId: "fix" },
      { at: at(651), type: "agent_completed", node: "w/fix", agentId: "fix" },
      { at: at(651), type: "node_completed", node: "w/fix" },
      { at: at(651), type: "node_started", node: "w/build/compile", visit: 1 },
      { at: at(661), type: "node_completed", node: "w/build/compile" },
      { at: at(661), type: "node_started", node: "w/review", visit: 1 },
      { at: at(661), type: "work_offered", node: "w/review", agentId: "docs" },
      { at: at(661), type: "work_offered", node: "w/review", agentId: "code" },
      { at: at(701), type: "agent_completed", node: "w/review", agentId: "docs" },
      { at: at(711), type: "agent_completed", node: "w/review", agentId: "code" },
      { at: at(711), type: "node_completed", node: "w/review" },
      { at: at(711), type: "node_started", node: "w/script", visit: 1 },
    ]),
    ledger: [ledgerRecord("w/script", at(711), 0, { kind: "script", durationMs: 840 })],
  };
  const step = (key: string): Item => ({ key, kind: "step", node: { id: key.split("/").at(-1) ?? key, kind: "llm" } });
  const reviewNode = { id: "review", kind: "llm" };
  const agent = (id: string): Item => ({ key: `w/review#${id}`, kind: "agent", node: reviewNode, agent: { id, role: undefined }, nodePath: "w/review" });
  const team: Item = { key: "w/review", kind: "team", node: reviewNode, inner: { items: [], edges: [] } };
  const group: Item = { key: "w/build", kind: "subgraph", node: { id: "build", kind: "subgraph", workflow: "b" }, inner: { items: [step("w/build/compile")], edges: [] } };
  const report = timelineReport(run);
  assert.equal(timeSpent(step("w/fix"), report), 50_000, "two passes of 30 s and 20 s add up");
  assert.deepEqual(itemPasses(step("w/fix"), report).map((p) => [p.visit, p.durationMs]), [[1, 30_000], [2, 20_000]], "each pass keeps its own duration");
  assert.equal(timeSpent(step("w/ask"), report), 1000, "the 10 minutes waiting for the answer are not step time");
  assert.equal(itemPasses(step("w/ask"), report)[0]?.waitMs, 600_000, "the wait is kept apart");
  assert.equal(timeSpent(team, report), 50_000, "parallel agents: the team shows wall time, not the sum of its agents");
  assert.equal(timeSpent(agent("docs"), report), 40_000, "an agent runs from work_offered to agent_completed");
  assert.equal(timeSpent(agent("code"), report), 50_000);
  assert.equal(timeSpent(group, report), 10_000, "a group sums the steps inside it");
  assert.equal(timeSpent(step("w/script"), report), 840, "an open pass falls back to the ledger durationMs");
  assert.equal(timeSpent(step("w/plan"), report), null, "a step that never ran has no time");
  assert.equal(timeSpent({ key: START_KEY, kind: "terminal", label: "start" }, report), null);
  assert.equal(timeSpent(step("w/fix"), null), null);
  assert.deepEqual(runCalls(report).filter((c) => c.node === "w/review").map((c) => [c.agent, c.durationMs]), [["docs", 40_000], ["code", 50_000]], "the calls tab gets the same per-agent times");
});

test("durations read as 840ms, 3m 12s or 1h 05m", async () => {
  const { formatDuration } = await import("../app/src/format.ts");
  assert.deepEqual(
    [null, 0, 840, 999, 1000, 59_400, 59_600, 192_000, 3_599_000, 3_900_000, 36_000_000].map(formatDuration),
    ["—", "0ms", "840ms", "999ms", "1s", "59s", "1m 00s", "3m 12s", "59m 59s", "1h 05m", "10h 00m"],
  );
});

test("demo run: every ledger record lands in one call and the index carries the run counts", async () => {
  const { allItems, ancestorKeys, findItem } = await import("../app/src/tree.ts");
  const { buildRunIndex, runCalls, runCount, timeSpent } = await import("../app/src/run-facts.ts");
  const { data, detail } = await demoRun();
  const calls = runCalls(detail.report);
  assert.equal(calls.reduce((s, c) => s + c.records, 0), detail.run.ledger.length, "no ledger record is lost or counted twice");
  assert.deepEqual(calls.map((c) => c.startedAt), [...calls.map((c) => c.startedAt)].sort(), "calls are in time order");
  const level = buildLevel(data.workflows(), "hello", "hello", ["hello"], detail.report);
  const index = buildRunIndex(level, data.config(), detail.report, detail.run);
  for (const item of allItems(level)) assert.equal(index.get(item.key)?.runs, runCount(item, detail.run, detail.report), `run count of ${item.key}`);
  for (const item of allItems(level)) assert.equal(index.get(item.key)?.timeMs, timeSpent(item, detail.report), `time of ${item.key}`);
  assert.equal(index.get("hello/plan")?.runs, 1);
  assert.equal(index.get("hello/review#docs")?.runs, 1, "an agent with ledger records but no agent_started event still counts its visit");
  assert.deepEqual(calls.filter((c) => c.node === "hello/review").map((c) => c.agent).sort(), ["docs", "security", "style", "tests"], "a team visit lists one call per agent");
  assert.equal(findItem(level, "hello/review#docs")?.kind, "agent");
  assert.deepEqual(ancestorKeys(level, "hello/review#docs"), ["hello/review"]);
  assert.deepEqual(ancestorKeys(level, "hello/build/verify"), ["hello/build"]);
  assert.deepEqual(ancestorKeys(level, "hello/plan"), []);
});

test("the run detail carries the supervisor and the ring shows its verdict, cost and full text", async () => {
  const { detail } = await demoRun();
  const supervisor = detail.report.supervisor;
  assert.equal(supervisor?.status, "done");
  const ring = supervisorRing(supervisor);
  assert.equal(ring.tone, "ok");
  assert.equal(ring.status, "ok");
  assert.match(ring.cost, /^\$0\.\d{6}$/);
  assert.match(ring.headline, /^bottleneck: hello\/\S+ · idea: none$/);
  assert.match(ring.text, /^FACTS: /);
  assert.ok(detail.run.ledger.some((r) => r.nodePath === "@supervisor"), "the supervisor cost is in the run ledger");
  const { runCalls } = await import("../app/src/run-facts.ts");
  const call = runCalls(detail.report).find((c) => c.node === "@supervisor");
  assert.equal(call?.status, "done", "the supervisor is one call in the calls list");
  assert.equal(call?.records, 1);
});

test("the supervisor ring has a state for every supervisor status", () => {
  assert.equal(supervisorRing(null).tone, "idle");
  assert.deepEqual(supervisorRing({ status: "running", agent: "olko-factory-supervisor" }), { tone: "busy", status: "analyzing the run", cost: "", headline: "analyzing the run", text: "", agent: "olko-factory-supervisor", model: null });
  const failed = supervisorRing({ status: "failed", agent: "a", error: "model unavailable", costUsd: 0 });
  assert.deepEqual([failed.tone, failed.headline, failed.text, failed.cost], ["failed", "model unavailable", "model unavailable", "$0.000000"]);
  const improve = supervisorRing({ status: "done", agent: "a", verdict: "improve", bottleneck: "w/fix", idea: "low tier", output: "x\nsupervise | improve | w/fix | low tier", costUsd: 0.0123, model: "claude-haiku-5-5" });
  assert.deepEqual([improve.tone, improve.headline, improve.model], ["improve", "bottleneck: w/fix · idea: low tier", "claude-haiku-5-5"]);
  assert.equal(supervisorRing({ status: "done", agent: "a", output: "free text\nlast line" }).headline, "last line", "no parseable line: the last line");
});

test("agents served to the viewer carry the memory-layer flag for the skill the config names", () => {
  const agents = api(false).agents();
  assert.equal(agents["olko-review-orchestrator"]?.memoryLayer, true, "declares olko-memory-layer in permission.skill");
  assert.equal(agents["olko-workflow-mapper"]?.memoryLayer, false, "declares no memory skill");
  const dataDir = tempDir("factory-app-");
  const custom = path.join(dataDir, "config.json");
  fs.writeFileSync(custom, JSON.stringify({ ...JSON.parse(fs.readFileSync(configFile, "utf8")), memoryLayer: "olko-agents-optimizer" }));
  const renamed = createDataApi({ factoryDir, dataDir, configFile: custom, demo: false }).agents();
  assert.equal(renamed["olko-review-orchestrator"]?.memoryLayer, false);
  assert.equal(renamed["olko-implementation-orchestrator"]?.memoryLayer, true, "declares olko-agents-optimizer");
});

test("only an agent step or team member shows the memory mark; a team, subgraph or script never does, even when a child has it", () => {
  const info = (name: string, memoryLayer: boolean) => ({ name, kind: "agent" as const, description: "", file: "", skills: [], missing: [], scripts: [], memoryLayer });
  const agents = { keeper: info("keeper", true), plain: info("plain", false) };
  const workflows = [
    { name: "main", version: "1", entry: "run", nodes: [{ id: "run", kind: "llm", agent: "keeper" }, { id: "team", kind: "llm", agents: [{ id: "a", agent: "keeper" }, { id: "b", agent: "plain" }, { id: "c" }] }, { id: "sub", kind: "subgraph", workflow: "child" }, { id: "dynamic", kind: "llm", agentsFrom: "state.run.agents" }, { id: "stop", kind: "script", op: "builtin.stop" }], edges: [{ from: "run", to: "team" }, { from: "team", to: "sub" }, { from: "sub", to: "dynamic" }, { from: "dynamic", to: "stop" }, { from: "stop", to: "END" }] },
    { name: "child", version: "1", entry: "inner", nodes: [{ id: "inner", kind: "llm", agent: "keeper" }], edges: [{ from: "inner", to: "END" }] },
  ];
  const level = buildLevel(workflows, "main");
  const item = (key: string) => level.items.find((i) => i.key === key)!;
  const team = item("main/team");
  assert.ok(team.kind === "team");
  assert.equal(hasMemoryLayer(item("main/run"), agents), true);
  assert.deepEqual(team.inner.items.map((i) => hasMemoryLayer(i, agents)), [true, false, false]);
  assert.equal(hasMemoryLayer(team, agents), false, "a team is not marked although its member a has the memory layer");
  const sub = item("main/sub");
  assert.ok(sub.kind === "subgraph");
  assert.deepEqual(sub.inner.items.filter((i) => i.kind === "step").map((i) => hasMemoryLayer(i, agents)), [true], "the agent inside the subgraph is marked");
  assert.equal(hasMemoryLayer(sub, agents), false, "a subgraph is not marked although its agent has the memory layer");
  assert.equal(hasMemoryLayer(item("main/dynamic"), agents), false, "a step whose agents come from state names no agent");
  assert.equal(hasMemoryLayer(item("main/stop"), agents), false, "an engine script is never marked");
  assert.equal(hasMemoryLayer(item("main/run"), {}), false, "an unknown agent has no mark");
});

test("an agent's skill scripts belong to its step or team member; a script step is an engine script", () => {
  const agents = { syncer: { name: "syncer", kind: "agent" as const, description: "", file: "", skills: [], missing: [], scripts: [{ skill: "sync", name: "sync.mjs", file: "skills/demo/sync/scripts/sync.mjs" }] } };
  const workflows = [
    { name: "main", version: "1", entry: "run", nodes: [{ id: "run", kind: "llm", agent: "syncer" }, { id: "team", kind: "llm", agents: [{ id: "a", agent: "syncer" }, { id: "b" }] }, { id: "stop", kind: "script", op: "builtin.stop" }], edges: [{ from: "run", to: "team" }, { from: "team", to: "stop" }, { from: "stop", to: "END" }] },
  ];
  const level = buildLevel(workflows, "main");
  const item = (key: string) => level.items.find((i) => i.key === key)!;
  const team = item("main/team");
  assert.ok(team.kind === "team");
  assert.deepEqual(agentScripts(item("main/run"), agents).map((s) => s.name), ["sync.mjs"]);
  assert.deepEqual(agentScripts(team.inner.items[0]!, agents).map((s) => s.name), ["sync.mjs"]);
  assert.deepEqual(agentScripts(team.inner.items[1]!, agents), []);
  assert.deepEqual(agentScripts(item("main/stop"), agents), []);
  assert.equal(isEngineScript(item("main/stop")), true);
  assert.equal(isEngineScript(item("main/run")), false);
  const height = (listed: boolean) => layoutGraph(level, new Set(), (i) => scriptsHeight(agentScripts(i, agents).length, listed)).nodes.find((n) => n.id === "main/run")!.height!;
  const plain = layoutGraph(level, new Set()).nodes.find((n) => n.id === "main/run")!.height!;
  assert.ok(height(false) > plain, "a script box inside the card makes it taller");
  assert.ok(height(true) > plain, "a script list in the card makes it taller");
});

test("the step an interrupt names in askedBy asks you; the interrupt and every group around the step pass the question on", () => {
  const agents = { asker: { name: "asker", kind: "agent" as const, description: "", file: "", skills: [], missing: [], scripts: [], asks: "question: allow" } };
  const workflows = [
    { name: "main", version: "1", entry: "inner", nodes: [{ id: "inner", kind: "subgraph", workflow: "check" }, { id: "shared", kind: "group", workflow: "pick" }, { id: "hello", kind: "llm", turns: 3, askAfterTurn: 2, question: { id: "q-hello", text: "Go on?" } }], edges: [{ from: "inner", to: "shared" }, { from: "shared", to: "hello" }, { from: "hello", to: "END" }] },
    { name: "check", version: "1", entry: "gate", nodes: [{ id: "gate", kind: "llm", skill: "olko-task-scope-gates" }, { id: "ask-scope", kind: "interrupt", askedBy: "gate", question: { id: "q-scope", text: "Extend?" } }, { id: "plain", kind: "interrupt", question: { id: "q-plain", text: "Merge?" } }], edges: [{ from: "gate", to: "ask-scope" }, { from: "ask-scope", to: "plain" }, { from: "plain", to: "END" }] },
    { name: "pick", version: "1", entry: "team", nodes: [{ id: "team", kind: "llm", agents: [{ id: "a", agent: "asker" }, { id: "b" }] }, { id: "ask-team", kind: "interrupt", askedBy: "team", question: { id: "q-team", text: "Which?" } }], edges: [{ from: "team", to: "ask-team" }, { from: "ask-team", to: "END" }] },
  ];
  const level = buildLevel(workflows, "main");
  const icons = humanIcons(level, agents);
  const roles = Object.fromEntries([...icons].map(([key, icon]) => [key, icon.role]));
  assert.deepEqual(roles, {
    "main/inner/gate": "asks",
    "main/inner/ask-scope": "relays",
    "main/inner": "relays",
    "main/team": "asks",
    "main/ask-team": "relays",
    "main/shared": "relays",
    "main/team#a": "asks",
    "main/hello": "asks",
  });
  assert.equal(icons.has("main/inner/plain"), false, "an interrupt without askedBy is the engine's own question");
  assert.equal(humanLabel(icons.get("main/inner/gate")!), "Asks you: q-scope (through ask-scope). Click to see the questions and your answers in this run");
  assert.equal(humanLabel(icons.get("main/inner/ask-scope")!), "Passes on a question to you from: gate. Click to see the questions and your answers in this run");
  assert.equal(humanLabel(icons.get("main/team#a")!), "May ask you itself (question: allow). Click to see the questions and your answers in this run");
  assert.equal(humanLabel(icons.get("main/hello")!), "Asks you: q-hello (through hello). Click to see the questions and your answers in this run");
  assert.equal(humanLabel(icons.get("main/shared")!), "Passes on a question to you from: team. Click to see the questions and your answers in this run");

  const reduced = agentsOnly(level);
  const shown = new Set(allItems(reduced).map((i) => i.key));
  assert.deepEqual([...icons.keys()].filter((k) => shown.has(k)).sort(), ["main/hello", "main/inner", "main/inner/gate", "main/shared", "main/team", "main/team#a"], "the agents-only view keeps every icon except the hidden interrupts");
});

test("every askedBy in the shipped workflows reaches a drawn llm step", () => {
  const data = api(false);
  const workflows = data.workflows();
  const agents = data.agents();
  let checked = 0;
  for (const workflow of workflows) {
    const level = buildLevel(workflows, workflow.name);
    const items = new Map(allItems(level).map((i) => [i.key, i]));
    for (const [key, icon] of humanIcons(level, agents)) {
      if (icon.role !== "relays" || items.get(key)?.kind !== "step") continue;
      assert.ok(icon.sources.length + icon.external.length > 0, `${workflow.name}: ${key} names no step`);
      for (const path of icon.sources) {
        const source = items.get(path);
        assert.ok(source && source.kind !== "terminal" && source.node.kind === "llm", `${workflow.name}: ${key} -> ${path}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 45, `checked ${checked}`);
});

test("a step's questions are the ones it asked or passed on; a group shows every question inside it", () => {
  const question = (questionId: string, node: string, askedBy: string[]) => ({ runId: "r-00000001", questionId, node, askedBy, text: "?", allowed: null, askedAt: "2026-11-17T10:00:00.000Z", answer: null, answeredAt: null });
  const questions = [question("q-scope", "main/inner/ask-scope", ["main/inner/gate"]), question("q-hello", "main/hello", ["main/hello"]), question("q-plain", "main/inner/plain", []), question("q-other", "main/inner/gate-2/ask", ["main/inner/gate-2/x"]), question("q-two", "main/rules/ask", ["main/rules/violations", "main/rules/merge"])];
  const ids = (key: string) => questionsFor(key, questions).map((q) => q.questionId);
  assert.deepEqual(ids("main/inner/gate"), ["q-scope"]);
  assert.deepEqual(ids("main/inner/ask-scope"), ["q-scope"]);
  assert.deepEqual(ids("main/hello"), ["q-hello"]);
  assert.deepEqual(ids("main/inner"), ["q-scope", "q-plain", "q-other"]);
  assert.deepEqual(ids("main/team#a"), []);
  assert.deepEqual(ids("main/rules/violations"), ["q-two"]);
  assert.deepEqual(ids("main/rules/merge"), ["q-two"]);
});

test("an interrupt naming several steps makes each of them ask; a step of another workflow asks where the diagram draws it", () => {
  const workflows = [
    { name: "sync", version: "1", entry: "cmp", nodes: [{ id: "cmp", kind: "subgraph", workflow: "compare" }, { id: "dec", kind: "subgraph", workflow: "decide" }], edges: [{ from: "cmp", to: "dec" }, { from: "dec", to: "END" }] },
    { name: "compare", version: "1", entry: "rows", nodes: [{ id: "rows", kind: "llm" }, { id: "merge", kind: "llm" }], edges: [{ from: "rows", to: "merge" }, { from: "merge", to: "END" }] },
    { name: "decide", version: "1", entry: "decide", nodes: [{ id: "own", kind: "llm" }, { id: "decide", kind: "interrupt", askedBy: ["own", { workflow: "compare", step: "rows" }], question: { id: "q-decide", text: "Which row?" } }], edges: [{ from: "own", to: "decide" }, { from: "decide", to: "END" }] },
  ];
  const icons = humanIcons(buildLevel(workflows, "sync"), {});
  assert.equal(icons.get("sync/dec/own")?.role, "asks");
  assert.equal(icons.get("sync/cmp/rows")?.role, "asks");
  assert.equal(icons.has("sync/cmp/merge"), false);
  assert.deepEqual(icons.get("sync/dec/decide")?.sources, ["sync/dec/own", "sync/cmp/rows"]);
  assert.equal(icons.get("sync/cmp")?.role, "relays", "the group holding the other workflow's step passes the question on");
  assert.equal(humanLabel(icons.get("sync/cmp/rows")!), "Asks you: q-decide (through decide). Click to see the questions and your answers in this run");

  const alone = humanIcons(buildLevel(workflows, "decide"), {});
  assert.deepEqual(alone.get("decide/decide")?.sources, ["decide/own"]);
  assert.deepEqual(alone.get("decide/decide")?.external, ["compare/rows"]);
  assert.equal(humanLabel(alone.get("decide/decide")!), "Passes on a question to you from: own, compare/rows (not in this diagram). Click to see the questions and your answers in this run");
});
