import "./helpers/isolated-home.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capturedErrors } from "./helpers/console.ts";
import { ALLOWED_HOSTS, callerFor } from "./helpers/data-api.ts";
import { tempDir } from "./helpers/temp.ts";
import { createDataApi, apiMiddleware } from "../src/viewer-data.ts";
import type { DataApi } from "../src/viewer-data.ts";

/**
 * The backend data API the viewer reads: the demo run, run details with their report parts, and the HTTP middleware.
 * The viewer functions that run on this JSON are tested with the viewer (factory/app/tests/api-contract.test.ts).
 */
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

function apiCall(data: DataApi) {
  return callerFor(apiMiddleware(data, ALLOWED_HOSTS));
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
  const logged = await capturedErrors(async () => {
    const result = await apiCall(failing)("GET", "/api/workflows");
    assert.equal(result.status, 500);
  });
  assert.deepEqual(logged.filter((line) => line.includes("/api/workflows")), ["viewer API /api/workflows failed: workflows folder unreadable"]);
});

test("api passes non-GET requests and other paths on to the next handler", async () => {
  const { data } = await demoRun();
  const call = apiCall(data);
  assert.equal((await call("POST", "/api/runs")).status, "next");
  assert.equal((await call("GET", "/index.html")).status, "next");
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

test("demo run: every ledger record lands in one call, in time order, and a team visit lists one call per agent", async () => {
  const { detail } = await demoRun();
  const { calls } = detail.report;
  assert.equal(calls.reduce((sum, call) => sum + call.records, 0), detail.run.ledger.length, "no ledger record is lost or counted twice");
  assert.deepEqual(calls.map((call) => call.startedAt), [...calls.map((call) => call.startedAt)].sort(), "calls are in time order");
  assert.deepEqual(calls.filter((call) => call.node === "hello/review").map((call) => call.agent).sort(), ["docs", "security", "style", "tests"]);
});

test("the run detail carries the finished supervisor, its ledger record and its call", async () => {
  const { detail } = await demoRun();
  assert.equal(detail.report.supervisor?.status, "done");
  assert.ok(detail.run.ledger.some((record) => record.nodePath === "@supervisor"), "the supervisor cost is in the run ledger");
  const call = detail.report.calls.find((candidate) => candidate.node === "@supervisor");
  assert.equal(call?.status, "done", "the supervisor is one call in the calls list");
  assert.equal(call?.records, 1);
});
