import "./helpers/isolated-home.ts";
import "./helpers/no-turn-delay.ts";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fencedJson, driveRun, stoppedBy } from "./helpers/plan-driver.ts";
import type { DriveHandlers } from "./helpers/plan-driver.ts";
import { tempDir } from "./helpers/temp.ts";
import { testHomeDir } from "./helpers/isolated-home.ts";
import { checkWorkflows } from "../src/validate-workflows.ts";
import type { ExecResult } from "../src/types.ts";

const WORKFLOWS = path.join(import.meta.dirname, "..", "workflows");
const PROJECT = path.join(tempDir("merge-project-"), "sample-app");
const MARKETPLACE = tempDir("merge-marketplace-");

interface ExecCall {
  command: string;
  args: string[];
}

type Replies = Record<string, unknown>;

/** A host exec that records every command and answers a script subcommand (the argument after the script path) with JSON. */
function fakeExec(replies: Replies): { calls: ExecCall[]; exec: (command: string, args: string[]) => Promise<ExecResult> } {
  const calls: ExecCall[] = [];
  const exec = async (command: string, args: string[]): Promise<ExecResult> => {
    calls.push({ command, args });
    const subcommand = args[1] ?? "";
    return { code: 0, stdout: JSON.stringify(replies[subcommand] ?? {}), stderr: "" };
  };
  return { calls, exec };
}

function plan(items: { id: string; state: string; conflicts: number }[], out = "/work"): unknown {
  return {
    project: PROJECT,
    marketplace: MARKETPLACE,
    out,
    ids: items.map((item) => item.id),
    conflicts: items.reduce((sum, item) => sum + item.conflicts, 0),
    modified: items.filter((item) => item.state === "modified").length,
    items: items.map((item) => ({ id: item.id, state: item.state })),
  };
}

function rows(ids: string[]): unknown {
  return { ids, items: ids.map((id, index) => ({ id, label: `${id} label`, detail: `${id} detail`, checked: index === 0 })) };
}

async function startRun(workflow: string, input: Record<string, unknown>, replies: Replies, handlers: DriveHandlers) {
  const { Factory } = await import("../src/engine.ts");
  const fake = fakeExec(replies);
  const factory = new Factory(tempDir("merge-workflow-"), { backend: "delegate", executors: { exec: fake.exec } });
  const { run } = factory.start(`run ${workflow}`, undefined, { workflow, input });
  factory.confirm(run.runId);
  const result = await driveRun(factory, run.runId, handlers);
  return { ...result, calls: fake.calls, runId: run.runId };
}

function callOf(calls: ExecCall[], subcommand: string): ExecCall | undefined {
  return calls.find((call) => call.args[1] === subcommand);
}

function flag(call: ExecCall | undefined, name: string): string | undefined {
  const args = call?.args ?? [];
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const MERGE_INPUT = { project: PROJECT, marketplace: MARKETPLACE, projectId: "sample-app" };

test("merge run: no items stops with a note", async () => {
  const { done, calls, order, asked, runId } = await startRun("olko-marketplace-merge", MERGE_INPUT, { prepare: plan([]) }, { reply: () => undefined });
  assert.ok(stoppedBy(done, /Nothing to merge/), JSON.stringify(done.events.at(-1)));
  assert.deepEqual(order, []);
  assert.deepEqual(asked, []);
  assert.deepEqual(calls.map((call) => call.args[1]), ["prepare"]);
  const prepare = callOf(calls, "prepare");
  assert.equal(prepare?.command, process.execPath);
  assert.equal(prepare?.args[0], `${MARKETPLACE}/scripts/olko-marketplace-merge.mjs`);
  assert.equal(flag(prepare, "--project"), PROJECT);
  assert.equal(flag(prepare, "--marketplace"), MARKETPLACE);
  assert.equal(path.resolve(flag(prepare, "--out") ?? ""), path.join(testHomeDir!, "merges", runId), "the work directory is a fresh folder in the factory home, named after the run");
});

test("merge run: answer none applies nothing", async () => {
  const out = path.join(testHomeDir!, "merges", "probe");
  const replies = { prepare: plan([{ id: "skill:sample-skill", state: "modified", conflicts: 0 }], out), summary: rows(["skill:sample-skill"]) };
  let questionItems: unknown;
  const result = await startRun("olko-marketplace-merge", MERGE_INPUT, replies, {
    reply: (work) => (work.step === "resolve" ? fencedJson({ resolved: 0, unsure: 0, classified: 1 }) : undefined),
    answer: (questionId, question) => {
      questionItems = question;
      assert.equal(questionId, "q-merge");
      return "none";
    },
  });
  assert.deepEqual(result.order, ["resolve"], "a modified item is classified for upstream even without conflicts");
  assert.ok(result.prompts.resolve?.[0]?.includes(out), "the prompt names the work directory");
  const pending = questionItems as { multiple?: boolean; allowed?: string[]; items?: unknown[] };
  assert.equal(pending.multiple, true);
  assert.deepEqual(pending.allowed, ["skill:sample-skill"]);
  assert.deepEqual(pending.items, [{ id: "skill:sample-skill", label: "skill:sample-skill label", detail: "skill:sample-skill detail", checked: true }]);
  assert.equal(result.done.status, "done");
  assert.deepEqual(result.calls.map((call) => call.args[1]), ["prepare", "summary", "apply"]);
  assert.equal(flag(callOf(result.calls, "summary"), "--out"), out, "summary reads the work directory the plan names");
  assert.equal(flag(callOf(result.calls, "apply"), "--out"), out);
  assert.equal(flag(callOf(result.calls, "apply"), "--selected"), "none");
});

test("merge run: the resolve step works only in the work directory with the upstream agent", async () => {
  const out = path.join(testHomeDir!, "merges", "probe-dirs");
  const replies = { prepare: plan([{ id: "skill:sample-skill", state: "outdated", conflicts: 1 }], out), summary: rows(["skill:sample-skill"]) };
  const { Factory } = await import("../src/engine.ts");
  const fake = fakeExec(replies);
  const factory = new Factory(tempDir("merge-workflow-"), { backend: "delegate", executors: { exec: fake.exec } });
  const { run } = factory.start("merge", undefined, { workflow: "olko-marketplace-merge", input: MERGE_INPUT });
  factory.confirm(run.runId);
  let seen: { dirs?: string[]; agentName?: string } | undefined;
  await driveRun(factory, run.runId, {
    reply: (work) => {
      seen = factory.get(run.runId).pendingWorkItems?.find((item) => item.nodePath === work.nodePath);
      return fencedJson({ resolved: 1, unsure: 0, classified: 0 });
    },
    answer: () => "none",
  });
  assert.equal(seen?.dirs?.[0], out, "the workflow lists the work directory only; the engine adds the folders of the skills the agent loads");
  assert.ok(!seen?.dirs?.includes(PROJECT) && !seen?.dirs?.includes(MARKETPLACE), "neither the project nor the marketplace checkout is open to edits");
  assert.equal(seen?.agentName, "olko-marketplace-upstream");
});

test("merge run: selected ids reach apply", async () => {
  const ids = ["agent:sample-agent", "skill:sample-skill"];
  const replies = { prepare: plan(ids.map((id) => ({ id, state: "outdated", conflicts: 0 }))), summary: rows(ids), apply: { applied: ids, skipped: [], upstream: [] } };
  const { done, calls, order, asked } = await startRun("olko-marketplace-merge", MERGE_INPUT, replies, { reply: () => undefined, answer: () => "skill:sample-skill,agent:sample-agent" });
  assert.equal(done.status, "done");
  assert.deepEqual(order, [], "nothing to resolve or classify: outdated items without conflicts skip the agent");
  assert.deepEqual(asked, ["q-merge"]);
  assert.equal(flag(callOf(calls, "apply"), "--selected"), "skill:sample-skill,agent:sample-agent");
  assert.equal(flag(callOf(calls, "apply"), "--out"), "/work");
});

const UPSTREAM_INPUT = { project: PROJECT, marketplace: MARKETPLACE, artifact: "skill:sample-skill", contentHash: "abc", base: "1.0.0", files: "workflow.md" };

test("upstream run with approved input skips the question", async () => {
  const { done, asked, order } = await startRun("olko-marketplace-upstream", { ...UPSTREAM_INPUT, approved: "true" }, {}, { reply: (work) => (work.step === "stage" ? fencedJson({ stage: null, classification: null }) : undefined) });
  assert.deepEqual(asked, []);
  assert.deepEqual(order, ["stage"]);
  assert.ok(stoppedBy(done, /no stage directory/));
});

test("upstream run without approval still asks first", async () => {
  const { done, asked, order, calls } = await startRun("olko-marketplace-upstream", { ...UPSTREAM_INPUT, approved: "false" }, {}, { reply: () => undefined, answer: () => "no" });
  assert.deepEqual(asked, ["q-upstream-decision"]);
  assert.deepEqual(order, []);
  assert.equal(done.status, "done");
  assert.ok(calls.some((call) => call.args.includes("--rejected")));
});

test("the merge and upstream workflows pass workflow validation", () => {
  const result = checkWorkflows(WORKFLOWS);
  const ours = result.errors.filter((error) => /olko-marketplace-(merge|upstream)/.test(error));
  assert.deepEqual(ours, []);
});
