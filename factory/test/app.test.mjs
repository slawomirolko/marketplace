import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataApi, apiMiddleware } from "../app/data.mjs";
import { buildLevel, costOf, failureOf, formatTokens, ledgerOf, formatUsd, END_KEY, START_KEY } from "../app/src/tree.js";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(factoryDir, "spec", "examples", "valid", "factory-config.json");

function api(demo) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-app-"));
  return createDataApi({ factoryDir, dataDir, configFile, demo });
}

async function demoRun() {
  const data = api(true);
  await data.ensureDemo();
  const [summary] = data.runs();
  return { data, detail: data.run(summary.runId) };
}

test("first start creates one finished demo run, later starts reuse it", async () => {
  const data = api(true);
  assert.equal(await data.ensureDemo(), true);
  assert.equal(await data.ensureDemo(), false);
  const runs = data.runs();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "done");
  assert.ok(runs[0].costUsd > 0, `demo run cost ${runs[0].costUsd}`);
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
  const agents = Object.entries(review.byAgent);
  assert.deepEqual(agents.map(([id]) => id), ["security", "style", "tests", "docs"]);
  for (const [id, a] of agents) assert.ok(a.costUsd > 0 && a.tokens > 0 && a.steps === 1, `agent ${id}: ${JSON.stringify(a)}`);
  assert.equal(review.byAgent.docs.tier, "low");
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
  assert.equal(build.kind, "subgraph");
  assert.equal(review.kind, "team");
  assert.deepEqual(build.inner.items.map((i) => i.key), ["hello/build/implement", "hello/build/verify"]);
  assert.ok(level.edges.some((e) => e.from === "hello/accountant" && e.to === END_KEY), "accountant leads to END");
  assert.ok(!build.inner.edges.some((e) => e.to === END_KEY), "inner END is not drawn");
});

test("a group's cost is the sum of its child nodes", async () => {
  const { data, detail } = await demoRun();
  const build = buildLevel(data.workflows(), "hello").items.find((i) => i.key === "hello/build");
  const report = detail.report;
  const buildCost = costOf(build, report);
  assert.equal(buildCost.costUsd, Math.round((report.byNode["hello/build/implement"].costUsd + report.byNode["hello/build/verify"].costUsd) * 1e6) / 1e6);
});

test("an agent's cost comes from its own entry in the node report", async () => {
  const { data, detail } = await demoRun();
  const review = buildLevel(data.workflows(), "hello").items.find((i) => i.key === "hello/review");
  const docs = review.inner.items.find((i) => i.agent.id === "docs");
  assert.equal(costOf(docs, detail.report), detail.report.byNode["hello/review"].byAgent.docs);
});

test("an agent's ledger records are only its own", async () => {
  const { data, detail } = await demoRun();
  const review = buildLevel(data.workflows(), "hello").items.find((i) => i.key === "hello/review");
  const docs = review.inner.items.find((i) => i.agent.id === "docs");
  assert.equal(ledgerOf(docs, detail.run).length, 1);
});

test("a group's ledger records include its child nodes' records", async () => {
  const { data, detail } = await demoRun();
  const build = buildLevel(data.workflows(), "hello").items.find((i) => i.key === "hello/build");
  assert.equal(ledgerOf(build, detail.run).length, 5);
});

test("a subgraph that points back to a running workflow is shown as missing", () => {
  const workflows = [{ name: "a", entry: "x", nodes: [{ id: "x", kind: "subgraph", workflow: "a" }], edges: [] }];
  const level = buildLevel(workflows, "a");
  assert.deepEqual(level.items.map((i) => i.key), [START_KEY, "a/x", END_KEY]);
  assert.equal(level.items[1].kind, "missing");
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
  const item = { kind: "step", key: "hello/build" };
  const run = (error) => ({ events: [{ type: "node_failed", node: "hello/build", error }] });
  assert.equal(failureOf(item, run('{"type":"http","status":429,"message":"rate limited"}')), "http 429: rate limited");
  assert.equal(failureOf(item, run('{"type":"http","status":500')), "http 500", "truncated JSON keeps type and status");
  assert.equal(failureOf(item, run("boom")), "boom", "plain text is shown as is");
});

test("a group shows a failure of any node inside it", () => {
  const group = { kind: "subgraph", key: "hello/build" };
  const run = { events: [{ type: "node_failed", node: "hello/build/verify", error: "boom" }] };
  assert.equal(failureOf(group, run), "boom");
});

test("unknown cost is shown as unknown, missing cost as not run", () => {
  assert.equal(formatUsd({ costUsd: 0, costSource: "unknown" }), "unknown");
  assert.equal(formatUsd(null), "not run");
  assert.equal(formatUsd({ costUsd: 0.1234567, costSource: "measured" }), "$0.123457");
});

function apiCall(data) {
  const middleware = apiMiddleware(data);
  return (method, url) =>
    new Promise((resolve) => {
      const res = { writeHead: (status) => ({ end: (body) => resolve({ status, body: JSON.parse(body) }) }) };
      middleware({ method, url }, res, () => resolve({ status: "next" }));
    });
}

test("api returns the run list and a run detail as JSON", async () => {
  const { data, detail } = await demoRun();
  const call = apiCall(data);
  assert.equal((await call("GET", "/api/runs")).body.length, 1);
  assert.equal((await call("GET", `/api/runs/${detail.run.runId}`)).body.report.runId, detail.run.runId);
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
  const { runReport } = await import("../src/engine.mjs");
  const { formatAmount, formatUsd } = await import("../app/src/tree.js");
  const record = (nodePath, model, costUsd, costSource) => ({ nodePath, agentId: nodePath.split("/").at(-1), kind: "llm", tier: "medium", model, inputTokens: 10, outputTokens: 1, costUsd, costSource });
  const run = {
    runId: "r-0000abcd",
    status: "done",
    workflow: "hello",
    config: { tiers: { medium: "m" }, backend: { kind: "delegate" }, budget: { maxCostUsd: 1 } },
    proposal: { budget: { maxCostUsd: 1 } },
    steps: 3,
    thresholdsHit: [],
    ledger: [record("hello/plan", "known", 0.25, "measured"), record("hello/build/implement", "known", null, "unknown"), record("hello/build/verify", "lost", null, "unknown")],
  };
  const report = runReport(run);
  assert.deepEqual(report.coverage.run, { llmSteps: 3, unknownSteps: 2 });
  assert.equal(formatAmount(report.cost.costUsd, report.coverage.run), "≥ $0.250000 (partial, 2 of 3 LLM steps unknown)");
  assert.equal(formatAmount(report.byModel.lost, report.coverage.byModel.lost), "unknown", "a model with only unknown steps is not $0");
  assert.equal(formatAmount(report.byModel.known, report.coverage.byModel.known), "≥ $0.250000 (partial, 1 of 2 LLM steps unknown)");
  assert.equal(formatAmount(report.byTier.medium, report.coverage.byTier.medium), "≥ $0.250000 (partial, 2 of 3 LLM steps unknown)");
  assert.equal(formatAmount(0.25, { llmSteps: 1, unknownSteps: 0 }), "$0.250000");
  const level = buildLevel(api(false).workflows(), "hello");
  const build = level.items.find((i) => i.key === "hello/build");
  assert.equal(formatUsd(costOf(build, report)), "unknown", "a subgraph whose LLM steps are all unknown is not $0");
});
