import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const URL_ = process.env.FACTORY_URL ?? "http://127.0.0.1:7340/mcp";
const TOKEN = process.env.FACTORY_TOKEN;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

async function connect(token = TOKEN) {
  const client = new Client({ name: "scenario-test", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

async function call(client, name, args) {
  const res = await client.callTool({ name, arguments: args });
  const payload = res.structuredContent ?? JSON.parse(res.content[0].text);
  return { payload, isError: Boolean(res.isError) };
}

async function pollUntil(client, runId, statuses, timeoutMs = 10000) {
  const started = Date.now();
  for (;;) {
    const { payload } = await call(client, "factory_status", { runId });
    assert.ok(payload.cost, "every status response carries the cost footer");
    if (statuses.includes(payload.status)) return payload;
    if (Date.now() - started > timeoutMs) throw new Error(`timeout waiting for ${statuses}, last=${payload.status}`);
    await new Promise((r) => setTimeout(r, 30));
  }
}

const client = await connect();

await check("tools are listed", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["factory_answer", "factory_cancel", "factory_confirm", "factory_next", "factory_report", "factory_start", "factory_status", "factory_submit", "factory_trace", "factory_wait"]);
});

await check("wrong token is rejected with 401", async () => {
  const res = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer wrong", "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 401);
});

let runId;
await check("start returns proposal waiting for confirmation (no model names in config, tiers only)", async () => {
  const { payload } = await call(client, "factory_start", { goal: "hello feature", idempotencyKey: "k-1" });
  runId = payload.runId;
  assert.equal(payload.status, "needs_confirmation");
  assert.deepEqual(payload.proposal.roles, { planner: "high", implementer: "medium", reviewer: "medium", accountant: "low" });
  assert.equal(payload.cost.costUsd, 0);
});

await check("start is idempotent for the same key", async () => {
  const { payload } = await call(client, "factory_start", { goal: "hello feature", idempotencyKey: "k-1" });
  assert.equal(payload.runId, runId);
  assert.equal(payload.reused, true);
});

await check("confirm starts run asynchronously and it pauses on the node question", async () => {
  const { payload } = await call(client, "factory_confirm", { runId });
  assert.equal(payload.status, "running");
  const waiting = await pollUntil(client, runId, ["waiting_for_user"]);
  assert.equal(waiting.pendingQuestion.id, "q-endpoint");
  assert.equal(waiting.currentNode, "hello/build/implement");
  assert.ok(waiting.cost.costUsd > 0, "cost already visible while waiting");
});

await check("invalid answer is rejected by the question schema", async () => {
  const { isError, payload } = await call(client, "factory_answer", { runId, questionId: "q-endpoint", answer: "maybe" });
  assert.equal(isError, true);
  assert.match(payload.error, /invalid answer/);
});

await check("answer resumes the same node; repeated answer is idempotent", async () => {
  const first = await call(client, "factory_answer", { runId, questionId: "q-endpoint", answer: "extend" });
  assert.equal(first.payload.duplicate, false);
  const second = await call(client, "factory_answer", { runId, questionId: "q-endpoint", answer: "extend" });
  assert.equal(second.payload.duplicate, true);
  const done = await pollUntil(client, runId, ["done", "stopped", "cancelled"]);
  assert.equal(done.status, "done");
});

await check("report: steps and cost per node and tier add up to the footer", async () => {
  const { payload } = await call(client, "factory_report", { runId });
  const sumNodes = Object.values(payload.byNode).reduce((s, n) => s + n.costUsd, 0);
  const sumSteps = Object.values(payload.byNode).reduce((s, n) => s + n.steps, 0);
  assert.ok(Math.abs(sumNodes - payload.cost.costUsd) < 0.001, `nodes ${sumNodes} vs total ${payload.cost.costUsd}`);
  assert.equal(sumSteps, payload.cost.steps);
  assert.equal(payload.cost.steps, 3 + 4 + 1 + 4 + 1);
  assert.deepEqual(Object.keys(payload.byTier).sort(), ["high", "low", "medium", "script"]);
  assert.equal(payload.byNode["hello/build/verify"].costUsd, 0);
  console.log(`      total $${payload.cost.costUsd}, tokens ${payload.cost.tokens}, steps ${payload.cost.steps}`);
});

await check("trace shows nested node paths and the user question event", async () => {
  const { payload } = await call(client, "factory_trace", { runId });
  assert.match(payload.trace, /hello\/build\/implement/);
  assert.match(payload.trace, /event needs_input/);
  console.log(payload.trace.split("\n").map((l) => `      ${l}`).join("\n"));
});

await check("budget: info at 50%, pause at 80% asks the user, 'stop' stops the run", async () => {
  const { payload } = await call(client, "factory_start", { goal: "budget test" });
  const id = payload.runId;
  await call(client, "factory_confirm", { runId: id, overrides: { budget: { maxCostUsd: 0.45 } } });
  let state = await pollUntil(client, id, ["waiting_for_user", "done", "stopped"]);
  if (state.pendingQuestion?.id === "q-endpoint") {
    await call(client, "factory_answer", { runId: id, questionId: "q-endpoint", answer: "new" });
    state = await pollUntil(client, id, ["waiting_for_user", "done", "stopped"]);
  }
  assert.equal(state.pendingQuestion?.id, "q-budget-pause", `expected budget pause, got ${state.status}`);
  assert.ok(state.cost.warnings.includes("budget threshold: info"));
  assert.ok(state.cost.budgetRatio >= 0.8);
  await call(client, "factory_answer", { runId: id, questionId: "q-budget-pause", answer: "stop" });
  const end = await pollUntil(client, id, ["stopped", "done"]);
  assert.equal(end.status, "stopped");
});

await check("factory_wait: run reaches the question and the end with 2 waits, no status polling", async () => {
  const { payload } = await call(client, "factory_start", { goal: "wait test" });
  const id = payload.runId;
  const confirmed = await call(client, "factory_confirm", { runId: id });
  assert.match(confirmed.payload.next, /factory_wait/);
  assert.equal(confirmed.payload.retryAfterMs, 2000);
  const atQuestion = await call(client, "factory_wait", { runId: id, timeoutSec: 10 });
  assert.equal(atQuestion.payload.status, "waiting_for_user");
  assert.equal(atQuestion.payload.timedOut, false);
  await call(client, "factory_answer", { runId: id, questionId: "q-endpoint", answer: "new" });
  const end = await call(client, "factory_wait", { runId: id, timeoutSec: 10 });
  assert.equal(end.payload.status, "done");
  assert.equal(end.payload.retryAfterMs, null);
});

await check("factory_wait times out on a running run and says so", async () => {
  const { payload } = await call(client, "factory_start", { goal: "timeout test" });
  await call(client, "factory_confirm", { runId: payload.runId, overrides: { budget: { maxCostUsd: 100 } } });
  const res = await call(client, "factory_wait", { runId: payload.runId, timeoutSec: 1 });
  assert.ok(["running", "waiting_for_user"].includes(res.payload.status));
  if (res.payload.status === "running") assert.equal(res.payload.timedOut, true);
  await call(client, "factory_cancel", { runId: payload.runId });
});

await check("throttle: tight factory_status loop is slowed to the minimum interval", async () => {
  const { payload } = await call(client, "factory_start", { goal: "throttle test" });
  const started = Date.now();
  for (let i = 0; i < 6; i += 1) await call(client, "factory_status", { runId: payload.runId });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 5 * 450, `6 calls took only ${elapsed} ms`);
  console.log(`      6 rapid calls took ${elapsed} ms`);
});

await check("throttle: tight factory_wait loop on an ended run is slowed and told to stop", async () => {
  const { payload } = await call(client, "factory_start", { goal: "ended wait test" });
  await call(client, "factory_cancel", { runId: payload.runId });
  const started = Date.now();
  let last;
  for (let i = 0; i < 6; i += 1) last = await call(client, "factory_wait", { runId: payload.runId, timeoutSec: 5 });
  const elapsed = Date.now() - started;
  assert.equal(last.payload.status, "cancelled");
  assert.match(last.payload.next, /Do not call factory_wait/);
  assert.ok(elapsed >= 5 * 450, `6 calls took only ${elapsed} ms`);
  console.log(`      6 rapid waits on an ended run took ${elapsed} ms`);
});

await client.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
