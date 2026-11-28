import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withEnv } from "./helpers/env.ts";
import { tempDir } from "./helpers/temp.ts";
import { SUPERVISOR_PATH, parseSupervisorLine, summarizeRun } from "../src/run-summary.ts";
import type { CliRequest, CliResult, LedgerRecord, Run, RunEvent } from "../src/types.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");
const { loadFactoryConfig } = await import("../src/config.ts");
const SUPERVISOR_AGENT = loadFactoryConfig().supervisor?.agent;
const VERDICT_LINE = { prefix: "supervise", verdicts: ["ok", "improve", "fix"] };
type FactoryType = InstanceType<typeof Factory>;

const T0 = Date.parse("2026-11-13T10:00:00.000Z");

function at(seconds: number): string {
  return new Date(T0 + seconds * 1000).toISOString();
}

function record(nodePath: string, fields: Partial<LedgerRecord>): LedgerRecord {
  return { runId: "r-1", workflow: "w@1", at: at(0), nodePath, kind: "llm", tier: "medium", model: "m-medium", backend: "cli:claude", turn: 1, inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: "measured", ...fields };
}

function event(seconds: number, type: string, fields: Omit<RunEvent, "at" | "type"> = {}): RunEvent {
  return { at: at(seconds), type, ...fields };
}

function handRun(): Run {
  const budget = { maxCostUsd: 10, infoRatio: 0.5, pauseRatio: 0.8 };
  const config = { roles: {}, tiers: { low: "m-low", medium: "m-medium", high: "m-high" }, backend: { kind: "cli" as const, cli: "claude" as const }, budget };
  return {
    runId: "r-1",
    idempotencyKey: null,
    goal: "g",
    workflow: "w",
    status: "failed",
    proposal: config,
    config,
    cursor: -1,
    nodeTurn: 0,
    steps: 5,
    pendingQuestion: null,
    pendingWork: null,
    answers: {},
    thresholdsHit: [],
    ledger: [
      record("w/plan", { tier: "high", model: "m-high", inputTokens: 1000, outputTokens: 100, costUsd: 0.5, durationMs: 10000 }),
      record("w/fix", { agentId: "a", inputTokens: 4000, outputTokens: 400, costUsd: 1, durationMs: 20000 }),
      record("w/fix", { agentId: "a", inputTokens: 4000, outputTokens: 400, costUsd: 1, durationMs: 20000 }),
      record("w/check", { kind: "script", tier: null, model: null, backend: "script", durationMs: 1000 }),
      record("w/judge", { costUsd: null, costSource: "unknown", inputTokens: null, outputTokens: null }),
      record(SUPERVISOR_PATH, { costUsd: 9, inputTokens: 9, outputTokens: 9 }),
    ],
    events: [
      event(0, "run_created"),
      event(0, "node_started", { node: "w/plan", visit: 1 }),
      event(10, "node_completed", { node: "w/plan" }),
      event(10, "node_started", { node: "w/ask", visit: 1 }),
      event(10, "needs_input", { node: "w/ask", questionId: "q-go" }),
      event(70, "run_resumed", { questionId: "q-go", answer: "yes" }),
      event(70, "node_completed", { node: "w/ask" }),
      event(70, "node_started", { node: "w/fix", visit: 1 }),
      event(90, "node_completed", { node: "w/fix" }),
      event(90, "node_started", { node: "w/check", visit: 1 }),
      event(91, "node_completed", { node: "w/check" }),
      event(91, "node_started", { node: "w/fix", visit: 2 }),
      event(111, "node_completed", { node: "w/fix" }),
      event(111, "node_started", { node: "w/docs", visit: 1 }),
      event(111, "node_skipped", { node: "w/docs", reason: "no work" }),
      event(111, "node_started", { node: "w/judge", visit: 1 }),
      event(112, "agent_failed", { node: "w/judge", agentId: "judge", error: "timeout" }),
      event(112, "node_failed", { node: "w/judge", error: "judge: timeout" }),
      event(112, "run_failed", { error: "boom" }),
      event(200, "supervisor_started", { node: SUPERVISOR_PATH }),
    ],
  };
}

test("the run summary ranks steps by cost, counts loops, waits and failures, and leaves the supervisor out", () => {
  const summary = summarizeRun(handRun());
  assert.deepEqual(summary.run, { runId: "r-1", workflow: "w", goal: "g", status: "failed", backend: "cli:claude", tierModels: { low: "m-low", medium: "m-medium", high: "m-high" }, budgetUsd: 10 });
  assert.equal(summary.totals.costUsd, 2.5);
  assert.equal(summary.totals.budgetRatio, 0.25);
  assert.equal(summary.totals.tokens, 9900);
  assert.equal(summary.totals.llmSteps, 4);
  assert.equal(summary.totals.scriptSteps, 1);
  assert.equal(summary.totals.unknownCostSteps, 1);
  assert.equal(summary.totals.wallMs, 112000, "first event to the run end, not to the supervisor");
  assert.equal(summary.totals.agentMs, 51000);
  assert.deepEqual(summary.nodes.map((n) => n.node), ["w/fix", "w/plan", "w/ask", "w/check", "w/judge", "w/docs"]);
  const fix = summary.nodes[0];
  assert.deepEqual({ visits: fix?.visits, calls: fix?.calls, agents: fix?.agents, costShare: fix?.costShare, wallMs: fix?.wallMs, inputTokens: fix?.inputTokens }, { visits: 2, calls: 2, agents: ["a"], costShare: 0.8, wallMs: 40000, inputTokens: 8000 });
  assert.equal(summary.nodes.find((n) => n.node === "w/ask")?.kind, "none");
  assert.equal(summary.nodes.find((n) => n.node === "w/judge")?.failures, 2);
  assert.deepEqual(summary.loops, [{ node: "w/fix", visits: 2 }]);
  assert.deepEqual(summary.questions, [{ questionId: "q-go", node: "w/ask", waitMs: 60000 }]);
  assert.deepEqual(summary.skipped, [{ node: "w/docs", reason: "no work" }]);
  assert.deepEqual(summary.failures.map((f) => f.error), ["timeout", "judge: timeout", "boom"]);
  assert.deepEqual(summary.top, { costNode: "w/fix", timeNode: "w/ask", longestQuestion: "q-go" });
  assert.ok(!summary.nodes.some((n) => n.node === SUPERVISOR_PATH));
});

test("the supervisor line is read from the last matching line", () => {
  assert.deepEqual(parseSupervisorLine("FACTS: x\nsupervise | improve | w/fix | lower fix to low tier | saves 40%\n", VERDICT_LINE), { verdict: "improve", bottleneck: "w/fix", idea: "lower fix to low tier | saves 40%" });
  assert.deepEqual(parseSupervisorLine("`supervise | ok | none | none`", VERDICT_LINE), { verdict: "ok", bottleneck: "none", idea: "none" });
  assert.equal(parseSupervisorLine("supervise | great | x | y", VERDICT_LINE), null);
  assert.equal(parseSupervisorLine("no line", VERDICT_LINE), null);
  assert.equal(parseSupervisorLine("supervisewise | ok | x | y", VERDICT_LINE), null);
  assert.deepEqual(parseSupervisorLine("review | pass | w/a | none", { prefix: "review", verdicts: ["pass", "fail"] }), { verdict: "pass", bottleneck: "w/a", idea: "none" });
});

test("the post-run agent, its prompt, host hint and verdict line come from config/factory.yaml", () => {
  const settings = loadFactoryConfig().supervisor;
  assert.equal(settings?.agent, "olko-factory-supervisor");
  assert.deepEqual(settings?.verdictLine, VERDICT_LINE);
  assert.ok(settings?.prompt.includes("{{summaryJson}}"));
  assert.match(settings?.hostHint ?? "", /supervisorWork/);
});

test("without a supervisor section in the config no post-run agent runs", async () => {
  const config = path.join(tempDir("factory-no-supervisor-"), "factory.yaml");
  const lines = fs.readFileSync(path.join(import.meta.dirname, "..", "config", "factory.yaml"), "utf8").split(/\r?\n/);
  const start = lines.indexOf("supervisor:");
  const end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  fs.writeFileSync(config, [...lines.slice(0, start), ...lines.slice(end)].join("\n"));
  await withEnv({ FACTORY_CONFIG: config }, async () => {
    assert.equal(loadFactoryConfig().supervisor, undefined);
    const factory = factoryWith({ backend: "fake" });
    const { run } = factory.start("unsupervised fake run");
    factory.confirm(run.runId);
    const ended = await finish(factory, run.runId);
    assert.equal(ended.status, "done");
    assert.equal(ended.supervisor, undefined);
    assert.equal(ended.ledger.filter((record) => record.nodePath === SUPERVISOR_PATH).length, 0);
  });
});

function factoryWith(options: ConstructorParameters<typeof Factory>[1]): FactoryType {
  return new Factory(tempDir("factory-supervisor-"), options);
}

async function finish(factory: FactoryType, runId: string): Promise<Run> {
  for (;;) {
    const { run } = await factory.waitForChange(runId, 30000);
    if (run.status === "waiting_for_user" && run.pendingQuestion) {
      factory.answer(runId, run.pendingQuestion.id, run.pendingQuestion.allowed?.[0] ?? "ok");
      continue;
    }
    if (run.status !== "running") return run;
  }
}

test("after a fake run ends the engine runs the supervisor once, adds its cost and keeps the run result", async () => {
  const factory = factoryWith({ backend: "fake" });
  const { run } = factory.start("supervised fake run");
  assert.equal(run.supervisor, undefined, "no supervisor before the run is confirmed");
  factory.confirm(run.runId);
  const ended = await finish(factory, run.runId);
  assert.equal(ended.status, "done");
  const supervisor = ended.supervisor;
  assert.equal(supervisor?.status, "done");
  assert.equal(supervisor?.agent, SUPERVISOR_AGENT);
  assert.equal(supervisor?.verdict, "ok");
  assert.match(supervisor?.output ?? "", /supervise \| ok \| hello\//);
  const records = ended.ledger.filter((r) => r.nodePath === SUPERVISOR_PATH);
  assert.equal(records.length, 1);
  assert.ok((supervisor?.costUsd ?? 0) > 0);
  assert.equal(supervisor?.costUsd, records[0]?.costUsd);
  const report = factory.report(ended);
  assert.equal(report.status, "done");
  assert.equal(report.byNode[SUPERVISOR_PATH]?.costUsd, supervisor?.costUsd, "the supervisor cost is in the run report");
  assert.equal(report.supervisor?.status, "done");
  assert.notEqual(report.result, supervisor?.output);
  assert.equal(factory.status(ended).supervisor?.verdict, "ok");
  factory.checkpoint(ended);
  assert.equal(factory.get(run.runId).ledger.filter((r) => r.nodePath === SUPERVISOR_PATH).length, 1, "a later checkpoint does not run it again");
  const saved = JSON.parse(fs.readFileSync(path.join(factory.dataDir, "runs", `${run.runId}.json`), "utf8")) as Run;
  assert.equal(saved.supervisor?.status, "done", "the supervisor output is stored with the run");
});

function cliStub(supervisorResult: (request: CliRequest) => CliResult) {
  const calls: CliRequest[] = [];
  const executor = async (request: CliRequest): Promise<CliResult> => {
    calls.push(request);
    if (request.agent === SUPERVISOR_AGENT) return supervisorResult(request);
    return { ok: true, text: "done", durationMs: 5, usageByModel: [{ model: request.model, tokens: { input: 100, output: 10 }, cacheWriteTtlKnown: true, harnessCostUsd: null }] };
  };
  return { calls, executor };
}

test("after a cli run ends the supervisor agent gets the summary JSON and its tokens go into the ledger", async () => {
  const stub = cliStub(() => ({ ok: true, text: "FACTS: ok\nsupervise | improve | hello/plan | run plan on the low tier", durationMs: 7, usageByModel: [{ model: "claude-haiku-5-5", tokens: { input: 2000, output: 200 }, cacheWriteTtlKnown: true, harnessCostUsd: null }] }));
  const factory = factoryWith({ backend: "cli", cli: "claude", executors: { claude: stub.executor } });
  const { run } = factory.start("supervised cli run");
  factory.confirm(run.runId);
  const ended = await finish(factory, run.runId);
  await factory.supervising.get(run.runId);
  assert.equal(ended.status, "done");
  const call = stub.calls.find((c) => c.agent === SUPERVISOR_AGENT);
  assert.ok(call, "the supervisor agent ran");
  assert.equal(call.model, "claude-haiku-5-5", "low tier model");
  assert.deepEqual(call.tools, ["read"]);
  const json = call.prompt.match(/```json\n([\s\S]*)\n```/)?.[1];
  assert.ok(json, "the prompt carries the summary JSON");
  assert.equal(JSON.parse(json).run.runId, run.runId);
  const current = factory.get(run.runId);
  assert.equal(current.status, "done", "the supervisor does not change the run status");
  assert.deepEqual({ status: current.supervisor?.status, verdict: current.supervisor?.verdict, bottleneck: current.supervisor?.bottleneck, idea: current.supervisor?.idea }, { status: "done", verdict: "improve", bottleneck: "hello/plan", idea: "run plan on the low tier" });
  const entry = current.ledger.find((r) => r.nodePath === SUPERVISOR_PATH);
  assert.equal(entry?.inputTokens, 2000);
  assert.equal(entry?.output, null, "the run result stays the workflow's");
  assert.ok((current.supervisor?.costUsd ?? 0) > 0);
});

test("a failing supervisor is recorded and leaves a failed run failed", async () => {
  const stub = cliStub(() => ({ ok: false, error: "model unavailable" }));
  const failing = async (request: CliRequest): Promise<CliResult> => (request.agent === SUPERVISOR_AGENT ? stub.executor(request) : { ok: false, error: "node broke" });
  const factory = factoryWith({ backend: "cli", cli: "claude", executors: { claude: failing } });
  const { run } = factory.start("failing run");
  factory.confirm(run.runId);
  const ended = await finish(factory, run.runId);
  await factory.supervising.get(run.runId);
  assert.equal(ended.status, "failed");
  const current = factory.get(run.runId);
  assert.equal(current.status, "failed");
  assert.equal(current.supervisor?.status, "failed");
  assert.equal(current.supervisor?.error, "model unavailable");
  assert.equal(JSON.parse(JSON.stringify(current.supervisor?.summary)).failures[0].error, "node broke");
});

test("in delegate mode a cancelled run offers the supervisor work to the client once", () => {
  const factory = factoryWith({ backend: "delegate" });
  const { run } = factory.start("cancelled run");
  factory.confirm(run.runId);
  factory.cancel(run.runId);
  const view = factory.status(factory.get(run.runId));
  assert.equal(view.status, "cancelled");
  assert.equal(view.supervisor?.status, "waiting_for_client");
  assert.equal(view.supervisorWork?.nodePath, SUPERVISOR_PATH);
  assert.equal(view.supervisorWork?.agentName, SUPERVISOR_AGENT);
  assert.match(view.supervisorWork?.prompt ?? "", /"status": "cancelled"/);
  assert.match(view.next, /supervisorWork/);
  const { duplicate } = factory.submit(run.runId, SUPERVISOR_PATH, "supervise | ok | none | none", { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 100 }, "supervisor");
  assert.equal(duplicate, false);
  const after = factory.status(factory.get(run.runId));
  assert.equal(after.status, "cancelled");
  assert.equal(after.supervisorWork, undefined);
  assert.equal(after.supervisor?.status, "done");
  assert.ok((after.supervisor?.costUsd ?? 0) > 0);
  assert.doesNotMatch(after.next, /supervisorWork/);
  assert.equal(factory.submit(run.runId, SUPERVISOR_PATH, "again").duplicate, true);
});
