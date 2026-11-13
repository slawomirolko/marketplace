import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataApi, apiMiddleware } from "../app/data.ts";
import type { DataApi } from "../app/data.ts";
import type { Run } from "../src/types.ts";
import type { Cost, Item, Level, RunData } from "../app/src/types.ts";
import { buildLevel, costOf, failureOf, formatTokens, ledgerOf, formatUsd, END_KEY, START_KEY } from "../app/src/tree.ts";

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

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(factoryDir, "spec", "examples", "valid", "factory-config.json");

function api(demo: boolean): DataApi {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-app-"));
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

interface ApiCallResult {
  status: number | "next";
  body?: unknown;
}

function apiCall(data: DataApi) {
  const middleware = apiMiddleware(data);
  return (method: string, url: string) =>
    new Promise<ApiCallResult>((resolve) => {
      const res = { writeHead: (status: number) => ({ end: (body: string) => resolve({ status, body: JSON.parse(body) }) }) };
      middleware({ method, url }, res, () => resolve({ status: "next" }));
    });
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

test("api passes non-GET requests and other paths on to the next handler", async () => {
  const { data } = await demoRun();
  const call = apiCall(data);
  assert.equal((await call("POST", "/api/runs")).status, "next");
  assert.equal((await call("GET", "/index.html")).status, "next");
});

test("totals with unknown steps are shown as unknown or partial, never as an exact amount", async () => {
  const { runReport } = await import("../src/engine.ts");
  const { formatAmount, formatUsd } = await import("../app/src/tree.ts");
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
  const level = buildLevel(api(false).workflows(), "hello");
  const build = itemAt(level, "hello/build");
  assert.equal(formatUsd(costOf(build, report)), "unknown", "a subgraph whose LLM steps are all unknown is not $0");
});

test("run index gives the same cost, tier and failure as the per-node lookups", async () => {
  const { buildRunIndex, tierOf } = await import("../app/src/tree.ts");
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
  const { runCount } = await import("../app/src/tree.ts");
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
  assert.equal(runCount(step("w/fix"), run), 3, "three visits of the retry loop");
  assert.equal(runCount(step("w/plan"), run), 0, "a step that never started shows 0");
  assert.equal(runCount(step("w/build"), run), 0, "a plain step does not count paths below its key");
  assert.equal(runCount(group, run), 3, "a group sums the step runs inside it");
  assert.equal(runCount(team, run), 2, "a team counts its own visits");
  assert.equal(runCount(agent("docs"), run), 2, "an agent counts its own starts");
  assert.equal(runCount(agent("code"), run), 1);
  assert.equal(runCount({ key: START_KEY, kind: "terminal", label: "start" }, run), null, "terminals have no count");
  assert.equal(runCount(step("w/fix"), null), null, "no run, no count");
});

test("run calls: every visit in time order with status, ledger cost and duration", async () => {
  const { runCalls } = await import("../app/src/tree.ts");
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
  const calls = runCalls(run);
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
  assert.equal(runCalls({ ...run, status: "running" }).at(-1)?.status, "running", "a live run shows open calls as running");
  assert.deepEqual(runCalls(null), []);
});

test("demo run: every ledger record lands in one call and the index carries the run counts", async () => {
  const { allItems, ancestorKeys, buildRunIndex, findItem, runCalls, runCount } = await import("../app/src/tree.ts");
  const { data, detail } = await demoRun();
  const calls = runCalls(detail.run);
  assert.equal(calls.reduce((s, c) => s + c.records, 0), detail.run.ledger.length, "no ledger record is lost or counted twice");
  assert.deepEqual(calls.map((c) => c.startedAt), [...calls.map((c) => c.startedAt)].sort(), "calls are in time order");
  const level = buildLevel(data.workflows(), "hello", "hello", ["hello"], detail.report);
  const index = buildRunIndex(level, data.config(), detail.report, detail.run);
  for (const item of allItems(level)) assert.equal(index.get(item.key)?.runs, runCount(item, detail.run), `run count of ${item.key}`);
  assert.equal(index.get("hello/plan")?.runs, 1);
  assert.equal(index.get("hello/review#docs")?.runs, 1, "an agent with ledger records but no agent_started event still counts its visit");
  assert.deepEqual(calls.filter((c) => c.node === "hello/review").map((c) => c.agent).sort(), ["docs", "security", "style", "tests"], "a team visit lists one call per agent");
  assert.equal(findItem(level, "hello/review#docs")?.kind, "agent");
  assert.deepEqual(ancestorKeys(level, "hello/review#docs"), ["hello/review"]);
  assert.deepEqual(ancestorKeys(level, "hello/build/verify"), ["hello/build"]);
  assert.deepEqual(ancestorKeys(level, "hello/plan"), []);
});
