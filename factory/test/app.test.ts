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
