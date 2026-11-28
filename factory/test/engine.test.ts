// The run loop of the engine: parallel CLI agents, cancelling a run during a step and a script that moves the workspace.
// Hermetic: a temp workflow folder, a stub CLI executor and a test operation. No model, no network.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { until } from "./helpers/poll.ts";
import { tempDir } from "./helpers/temp.ts";
import type { CliRequest, CliResult, Run } from "../src/types.ts";

const workflows = tempDir("factory-engine-workflows-");
fs.writeFileSync(
  path.join(workflows, "parallel.yaml"),
  `
name: parallel
version: 1.0.0
roles: { worker: low }
entry: review
nodes:
  - id: review
    kind: llm
    role: worker
    agents: [{ id: broken }, { id: slow-one }, { id: slow-two }]
    parse: { json: [verdict] }
    prompt: "Review as {{agent.id}}."
edges:
  - { from: review, to: END }
`,
);
fs.writeFileSync(
  path.join(workflows, "single.yaml"),
  `
name: single
version: 1.0.0
roles: { worker: low }
entry: work
nodes:
  - id: work
    kind: llm
    role: worker
    prompt: "Work."
  - id: after
    kind: llm
    role: worker
    prompt: "After."
edges:
  - { from: work, to: after }
  - { from: after, to: END }
`,
);
fs.writeFileSync(
  path.join(workflows, "moves.yaml"),
  `
name: moves
version: 1.0.0
entry: move
nodes:
  - id: move
    kind: script
    op: test.workspace
edges:
  - { from: move, to: END }
`,
);
process.env.FACTORY_WORKFLOWS_DIR = workflows;
process.env.FACTORY_TURN_DELAY_MS = "0";

const { Factory } = await import("../src/engine.ts");
const SUPERVISOR_AGENT = (await import("../src/config.ts")).loadFactoryConfig().supervisor?.agent;
const { OPERATIONS } = await import("../src/ops.ts");
OPERATIONS["test.workspace"] = async ({ input }) => ({ state: {}, output: "moved", workspace: String(input.target) });

type FactoryType = InstanceType<typeof Factory>;
type Executor = (request: CliRequest) => Promise<CliResult>;

const SUPERVISOR_RESULT: CliResult = { ok: true, text: "supervise | ok | none | none" };

function dataDir(): string {
  return tempDir("factory-engine-data-");
}

function cliFactory(executor: Executor): FactoryType {
  const withSupervisor: Executor = async (request) => (request.agent === SUPERVISOR_AGENT ? SUPERVISOR_RESULT : executor(request));
  return new Factory(dataDir(), { backend: "cli", cli: "claude", executors: { claude: withSupervisor } });
}

function eventTypes(run: Run): string[] {
  return run.events.map((event) => event.type);
}

function ok(text: string): CliResult {
  return { ok: true, text, usageByModel: [] };
}

test("a failing parallel agent fails the node only after its siblings finished, with every failure", async () => {
  const settled: Promise<unknown>[] = [];
  const factory = cliFactory(async (request) => {
    if (request.prompt.includes("broken")) {
      return ok("not json");
    }
    const slow = new Promise<CliResult>((resolve) => setTimeout(() => resolve(ok('{"verdict": "fine"}')), 60));
    settled.push(slow);
    return slow;
  });
  const { run } = factory.start("parallel goal", undefined, { workflow: "parallel" });
  factory.confirm(run.runId);
  await until(() => settled.length === 2, "the slow agents to start");
  await Promise.all(settled);
  await until(() => factory.get(run.runId).status !== "running", "the run to end");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const ended = factory.get(run.runId);
  assert.equal(ended.status, "failed");
  const types = eventTypes(ended);
  const failedAt = types.findIndex((type) => type === "node_failed" || type === "run_failed");
  assert.ok(failedAt >= 0, "the failure is recorded");
  assert.equal(types.lastIndexOf("agent_completed") < failedAt, true, "no agent writes to the run after it failed");
  assert.deepEqual(ended.events.filter((event) => event.type === "agent_completed").map((event) => event.agentId).sort(), ["slow-one", "slow-two"]);
  assert.match(String(ended.events[failedAt]?.error), /broken: /);
});

async function cancelDuringStep(result: CliResult): Promise<Run> {
  let release: (value: CliResult) => void = () => undefined;
  let started = false;
  const factory = cliFactory(async (request) => {
    if (request.prompt !== "Work.") {
      return ok("later step");
    }
    started = true;
    return new Promise<CliResult>((resolve) => {
      release = resolve;
    });
  });
  const { run } = factory.start("cancel goal", undefined, { workflow: "single" });
  factory.confirm(run.runId);
  await until(() => started, "the step to start");
  factory.cancel(run.runId);
  release(result);
  await until(() => !factory.busy.has(run.runId), "the step to return");
  return factory.get(run.runId);
}

test("a run cancelled during a CLI step stays cancelled and does not move on when the step succeeds", async () => {
  const run = await cancelDuringStep(ok("done"));
  assert.equal(run.status, "cancelled");
  assert.equal(eventTypes(run).includes("edge_taken"), false, "the run did not advance");
  assert.equal(run.cursor, 0, "the cursor stays on the cancelled step");
});

test("a run cancelled during a CLI step stays cancelled when the step fails", async () => {
  const run = await cancelDuringStep({ ok: false, error: "killed" });
  assert.equal(run.status, "cancelled");
  assert.equal(eventTypes(run).includes("node_failed"), false);
});

test("cancelling a cancelled run changes nothing", () => {
  const factory = new Factory(dataDir(), { backend: "fake" });
  const { run } = factory.start("cancel twice", undefined, { workflow: "single" });
  factory.cancel(run.runId);
  const events = factory.get(run.runId).events.length;
  factory.cancel(run.runId);
  const after = factory.get(run.runId);
  assert.equal(after.status, "cancelled");
  assert.equal(after.events.length, events, "no second run_cancelled event");
});

async function moveTo(target: string): Promise<Run> {
  const factory = new Factory(dataDir(), { backend: "fake" });
  const { run } = factory.start("move goal", undefined, { workflow: "moves", input: { target } });
  factory.confirm(run.runId);
  await until(() => !["running", "needs_confirmation"].includes(factory.get(run.runId).status), "the run to end");
  return factory.get(run.runId);
}

test("a script that moves the workspace to a folder that does not exist fails the run", async () => {
  const missing = path.join(os.tmpdir(), "factory-engine-no-such-workspace");
  const run = await moveTo(missing);
  assert.equal(run.status, "failed");
  assert.match(String(run.events.find((event) => event.type === "run_failed")?.error), /is not a directory/);
  assert.equal(run.workspace, undefined);
});

test("a script that moves the workspace to a folder records the move once", async () => {
  const target = tempDir("factory-engine-workspace-");
  const run = await moveTo(target);
  assert.equal(run.status, "done");
  assert.equal(run.workspace, target);
  assert.deepEqual(run.events.filter((event) => event.type === "workspace_changed").map((event) => event.workspace), [target]);
});

function deadPid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid ?? 0;
}

function rewriteRun(dir: string, runId: string, change: (run: Run) => void): void {
  const file = path.join(dir, "runs", `${runId}.json`);
  const run = JSON.parse(fs.readFileSync(file, "utf8")) as Run;
  change(run);
  fs.writeFileSync(file, JSON.stringify(run));
}

async function capturedErrors(action: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => {
    lines.push(parts.map(String).join(" "));
  };
  try {
    await action();
  } finally {
    console.error = original;
  }
  return lines;
}

test("a restart records run_recovered for each rescheduled run and for a reset supervisor", () => {
  const dir = dataDir();
  const first = new Factory(dir, { backend: "fake" });
  const { run } = first.start("recover goal", undefined, { workflow: "single" });
  const ownerPid = deadPid();
  rewriteRun(dir, run.runId, (stored) => {
    Object.assign(stored, { status: "running", config: stored.proposal, ownerPid, supervisor: { status: "running", agent: SUPERVISOR_AGENT ?? "supervisor" } });
  });
  const second = new Factory(dir, { backend: "fake" });
  const recovered = second.get(run.runId).events.filter((event) => event.type === "run_recovered");
  assert.deepEqual(recovered.map((event) => ({ node: event.node, previousOwnerPid: event.previousOwnerPid })), [
    { node: undefined, previousOwnerPid: ownerPid },
    { node: "@supervisor", previousOwnerPid: ownerPid },
  ]);
  second.cancel(run.runId);
});

test("a run that fails in its step logs one line with the run id and the error", async () => {
  const dir = dataDir();
  const first = new Factory(dir, { backend: "fake" });
  const { run } = first.start("failing goal", undefined, { workflow: "single" });
  rewriteRun(dir, run.runId, (stored) => {
    Object.assign(stored, { status: "running", ownerPid: deadPid() });
  });
  const errors = await capturedErrors(async () => {
    const second = new Factory(dir, { backend: "fake" });
    await until(() => second.get(run.runId).status === "failed", "the run to fail");
  });
  assert.deepEqual(errors.filter((line) => line.includes(run.runId)), [`run ${run.runId} failed: run ${run.runId} is not confirmed`]);
});
