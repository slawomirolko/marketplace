import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataApi, apiMiddleware } from "../app/data.mjs";
import { buildLevel, costOf, ledgerOf, formatUsd, END_KEY, START_KEY } from "../app/src/tree.js";

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
  assert.ok(runs[0].costUsd > 0);
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
  for (const [, a] of agents) assert.ok(a.costUsd > 0 && a.tokens > 0 && a.steps === 1);
  assert.equal(review.byAgent.docs.tier, "low");
  assert.equal(review.tier, "mixed");
  const sum = agents.reduce((s, [, a]) => s + a.costUsd, 0);
  assert.ok(Math.abs(sum - review.costUsd) <= agents.length * 1e-6, `${sum} vs ${review.costUsd}`);
});

test("graph tree: subgraph and team are groups, keys match ledger node paths", async () => {
  const { data, detail } = await demoRun();
  const level = buildLevel(data.workflows(), "hello");
  assert.deepEqual(level.items.map((i) => i.key), [START_KEY, "hello/plan", "hello/build", "hello/review", "hello/accountant", END_KEY]);
  const build = level.items.find((i) => i.key === "hello/build");
  const review = level.items.find((i) => i.key === "hello/review");
  assert.equal(build.kind, "subgraph");
  assert.equal(review.kind, "team");
  assert.deepEqual(build.inner.items.map((i) => i.key), ["hello/build/implement", "hello/build/verify"]);
  assert.ok(level.edges.some((e) => e.from === "hello/accountant" && e.to === END_KEY));
  assert.ok(!build.inner.edges.some((e) => e.to === END_KEY), "inner END is not drawn");

  const report = detail.report;
  const buildCost = costOf(build, report);
  assert.equal(buildCost.costUsd, Math.round((report.byNode["hello/build/implement"].costUsd + report.byNode["hello/build/verify"].costUsd) * 1e6) / 1e6);
  const docs = review.inner.items.find((i) => i.agent.id === "docs");
  assert.equal(costOf(docs, report), report.byNode["hello/review"].byAgent.docs);
  assert.equal(ledgerOf(docs, detail.run).length, 1);
  assert.equal(ledgerOf(build, detail.run).length, 5);
});

test("unknown cost is shown as unknown, missing cost as not run", () => {
  assert.equal(formatUsd({ costUsd: 0, costSource: "unknown" }), "unknown");
  assert.equal(formatUsd(null), "not run");
  assert.equal(formatUsd({ costUsd: 0.1234567, costSource: "measured" }), "$0.123457");
});

test("api answers only GET and returns JSON", async () => {
  const { data, detail } = await demoRun();
  const middleware = apiMiddleware(data);
  const call = (method, url) =>
    new Promise((resolve) => {
      const res = { writeHead: (status) => ({ end: (body) => resolve({ status, body: JSON.parse(body) }) }) };
      middleware({ method, url }, res, () => resolve({ status: "next" }));
    });
  assert.equal((await call("GET", "/api/runs")).body.length, 1);
  assert.equal((await call("GET", `/api/runs/${detail.run.runId}`)).body.report.runId, detail.run.runId);
  assert.equal((await call("GET", "/api/runs/nope")).status, 404);
  assert.equal((await call("POST", "/api/runs")).status, "next");
  assert.equal((await call("GET", "/index.html")).status, "next");
});
