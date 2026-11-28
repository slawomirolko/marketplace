import "./helpers/isolated-home.ts";
import "./helpers/no-turn-delay.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import { fencedJson, driveRun, stoppedBy } from "./helpers/plan-driver.ts";
import type { DriveHandlers } from "./helpers/plan-driver.ts";
import { tempDir } from "./helpers/temp.ts";
import { testHomeDir } from "./helpers/isolated-home.ts";
import { checkWorkflows } from "../src/validate-workflows.ts";
import { opencodeConfigDir } from "../src/cli-agents.ts";
import type { CliRequest, CliResult, ExecResult } from "../src/types.ts";

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

function plan(items: { id: string; state: string; conflicts: number }[], out = tempDir("merge-work-")): unknown {
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

test("merge run: no items ends done with a note", async () => {
  const { done, calls, order, asked, runId } = await startRun("olko-marketplace-merge", MERGE_INPUT, { prepare: plan([]) }, { reply: () => undefined });
  assert.equal(done.status, "done", "an empty merge is a normal outcome");
  const note = done.events.find((event) => event.type === "node_completed" && String(event.node).endsWith("/nothing"));
  assert.match(String(note?.result), /^Nothing to merge: no outdated or diverged skills or agents/);
  assert.deepEqual(order, []);
  assert.deepEqual(asked, []);
  assert.deepEqual(calls.map((call) => call.args[1]), ["prepare"]);
  const prepare = callOf(calls, "prepare");
  assert.equal(prepare?.command, process.execPath);
  assert.equal(prepare?.args[0], `${MARKETPLACE}/scripts/olko-marketplace-merge.mjs`);
  assert.equal(flag(prepare, "--project"), PROJECT);
  assert.equal(flag(prepare, "--marketplace"), MARKETPLACE);
  assert.equal(path.resolve(flag(prepare, "--out") ?? ""), path.join(testHomeDir!, "merges", runId), "the work directory is a fresh folder in the factory home, named after the run");
  assert.equal(path.resolve(flag(prepare, "--plan") ?? ""), path.join(testHomeDir!, "merges", `${runId}.plan.json`), "the plan lies next to the work directory, out of the resolve agent's reach");
});

test("merge run: answer none applies nothing", async () => {
  const out = tempDir("merge-work-");
  const replies = { prepare: plan([{ id: "skill:sample-skill", state: "modified", conflicts: 0 }], out), summary: rows(["skill:sample-skill"]) };
  let questionItems: unknown;
  let questionText = "";
  const result = await startRun("olko-marketplace-merge", MERGE_INPUT, replies, {
    reply: (work) => (work.step === "resolve" ? fencedJson({ resolved: 0, unsure: 0, classified: 1 }) : undefined),
    answer: (questionId, question) => {
      questionItems = question;
      questionText = question.text;
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
  const planFile = path.join(testHomeDir!, "merges", `${result.runId}.plan.json`);
  assert.equal(path.resolve(flag(callOf(result.calls, "summary"), "--plan") ?? ""), planFile, "summary reads the plan prepare wrote, not a file in the work directory");
  assert.equal(flag(callOf(result.calls, "summary"), "--out"), undefined);
  const apply = callOf(result.calls, "apply");
  assert.equal(path.resolve(flag(apply, "--plan") ?? ""), planFile);
  assert.equal(flag(apply, "--project"), PROJECT, "apply takes the project from the run input");
  assert.equal(flag(apply, "--marketplace"), MARKETPLACE, "apply takes the marketplace from the run input");
  assert.equal(flag(apply, "--out"), undefined);
  assert.equal(flag(apply, "--selected"), "none");
  assert.match(questionText, /creates \.agents\/marketplace\.lock\.json/, "the question says applying creates the lock in a project without one");
});

test("merge run: the resolve step works only in the work directory with the upstream agent", async () => {
  const out = tempDir("merge-work-");
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
  const out = tempDir("merge-work-");
  const replies = { prepare: plan(ids.map((id) => ({ id, state: "outdated", conflicts: 0 })), out), summary: rows(ids), apply: { applied: ids, skipped: [], upstream: [] } };
  const { done, calls, order, asked } = await startRun("olko-marketplace-merge", MERGE_INPUT, replies, { reply: () => undefined, answer: () => "skill:sample-skill,agent:sample-agent" });
  assert.equal(done.status, "done");
  assert.deepEqual(order, [], "nothing to resolve or classify: outdated items without conflicts skip the agent");
  assert.deepEqual(asked, ["q-merge"]);
  assert.equal(flag(callOf(calls, "apply"), "--selected"), "skill:sample-skill,agent:sample-agent");
  assert.equal(flag(callOf(calls, "apply"), "--project"), PROJECT);
});

test("merge run: a marketplace source checkout plan skips the resolve step and its rows reach apply", async () => {
  const ids = ["pull", "publish:skill:sample-skill"];
  const sourcePlan = { project: PROJECT, marketplace: MARKETPLACE, out: tempDir("merge-work-"), ids, conflicts: 0, modified: 0, source: 2, items: [{ id: "pull", action: "pull" }, { id: "publish:skill:sample-skill", action: "publish", state: "modified" }] };
  let questionText = "";
  const { done, calls, order, asked } = await startRun("olko-marketplace-merge", MERGE_INPUT, { prepare: sourcePlan, summary: rows(ids), apply: { applied: ids, skipped: [], upstream: [] } }, {
    reply: () => undefined,
    answer: (_questionId, question) => {
      questionText = question.text;
      return ids.join(",");
    },
  });
  assert.equal(done.status, "done");
  assert.deepEqual(order, [], "a source checkout has no three-way merge to resolve");
  assert.deepEqual(asked, ["q-merge"]);
  assert.deepEqual(calls.map((call) => call.args[1]), ["prepare", "summary", "apply"]);
  assert.equal(flag(callOf(calls, "apply"), "--selected"), "pull,publish:skill:sample-skill");
  assert.match(questionText, /marketplace source checkout/);
  assert.match(questionText, /fast-forward/);
  assert.match(questionText, /draft PR/);
});

const UPSTREAM_INPUT ={ project: PROJECT, marketplace: MARKETPLACE, artifact: "skill:sample-skill", contentHash: "abc", base: "1.0.0", files: "workflow.md" };

test("upstream run skips the question when the lock confirms the approval of this content", async () => {
  const replies = { approved: { approved: true, reason: "approved" } };
  const { done, asked, order, calls } = await startRun("olko-marketplace-upstream", { ...UPSTREAM_INPUT, approved: "true" }, replies, { reply: (work) => (work.step === "stage" ? fencedJson({ stage: null, classification: null }) : undefined) });
  assert.deepEqual(asked, []);
  assert.deepEqual(order, ["stage"]);
  assert.ok(stoppedBy(done, /no stage directory/));
  const check = callOf(calls, "approved");
  assert.equal(check?.args[0], `${MARKETPLACE}/scripts/olko-marketplace-lock.mjs`);
  assert.equal(flag(check, "--project"), PROJECT);
  assert.equal(flag(check, "--artifact"), "skill:sample-skill");
  assert.equal(flag(check, "--content-hash"), "abc");
  const note = done.events.find((event) => event.type === "node_completed" && String(event.node).endsWith("/route"));
  assert.doesNotMatch(String(note?.result), /verify passed/);
});

test("upstream run with approved input but no matching lock approval still asks first", async () => {
  const replies = { approved: { approved: false, reason: "not-approved" } };
  const { done, asked, order, calls } = await startRun("olko-marketplace-upstream", { ...UPSTREAM_INPUT, approved: "true" }, replies, { reply: () => undefined, answer: () => "no" });
  assert.deepEqual(asked, ["q-upstream-decision"], "the input alone never skips the question");
  assert.deepEqual(order, []);
  assert.equal(done.status, "done");
  assert.ok(calls.some((call) => call.args.includes("--rejected")));
});

test("upstream run without approval still asks first", async () => {
  const { done, asked, order, calls } = await startRun("olko-marketplace-upstream", { ...UPSTREAM_INPUT, approved: "false" }, { approved: { approved: false, reason: "no-lock" } }, { reply: () => undefined, answer: () => "no" });
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

test("merge run on a CLI backend: resolve runs in the work directory and may leave it only for the node's directories", async () => {
  const { Factory } = await import("../src/engine.ts");
  const out = tempDir("merge-work-");
  const fake = fakeExec({ prepare: plan([{ id: "skill:sample-skill", state: "modified", conflicts: 1 }], out), summary: rows(["skill:sample-skill"]) });
  const requests: CliRequest[] = [];
  const opencode = async (request: CliRequest): Promise<CliResult> => {
    if (request.agent === "olko-marketplace-upstream") {
      requests.push(request);
    }
    return { ok: true, text: fencedJson({ resolved: 1, unsure: 0, classified: 1 }), turns: 1, usageByModel: [] };
  };
  const factory = new Factory(tempDir("merge-workflow-"), { backend: "cli", cli: "opencode", executors: { exec: fake.exec, opencode } });
  const { run } = factory.start("merge", undefined, { workflow: "olko-marketplace-merge", input: MERGE_INPUT });
  factory.confirm(run.runId, { backend: { kind: "cli", cli: "opencode" } });
  const { done } = await driveRun(factory, run.runId, { reply: () => undefined, answer: () => "none" });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.agent, "olko-marketplace-upstream");
  assert.equal(requests[0]?.cwd, out, "the agent works in the work directory, not in the project");
  assert.deepEqual(requests[0]?.tools, ["read", "edit"], "no shell: the folder limits cannot be bypassed");
  const configDir = opencodeConfigDir("olko-marketplace-upstream", requests[0]!.tools, requests[0]!.dirs, requests[0]!.limitDirs);
  const front = fs.readFileSync(path.join(configDir, "agents", "olko-marketplace-upstream.md"), "utf8").split("\n")[1] ?? "{}";
  fs.rmSync(configDir, { recursive: true, force: true });
  assert.equal((JSON.parse(front) as { permission: { bash: unknown } }).permission.bash, "deny", "the generated OpenCode agent of the resolve step has no shell");
  assert.equal(requests[0]?.limitDirs?.[0], out, "the step's own directories limit where the agent may go outside its workspace");
  assert.deepEqual(requests[0]?.limitDirs, requests[0]?.dirs, "besides the work directory only the folders of the skills the agent loads");
  assert.ok(!requests[0]?.limitDirs?.includes(PROJECT) && !requests[0]?.limitDirs?.includes(MARKETPLACE), "neither the project nor the marketplace checkout");
});

test("only the resolve step of the merge workflow is isolated", () => {
  const isolated = fs
    .readdirSync(WORKFLOWS)
    .filter((file) => file.endsWith(".yaml"))
    .flatMap((file) => {
      const workflow = parseYaml(fs.readFileSync(path.join(WORKFLOWS, file), "utf8")) as { name: string; nodes?: { id: string; isolate?: boolean }[] };
      return (workflow.nodes ?? []).filter((node) => node.isolate === true).map((node) => `${workflow.name}/${node.id}`);
    });
  assert.deepEqual(isolated, ["olko-marketplace-merge/resolve"]);
});

test("a step that lists its own dirs but is not isolated keeps the agent's own permissions on a CLI backend", async () => {
  const { Factory } = await import("../src/engine.ts");
  const fake = fakeExec({ approved: { approved: true, reason: "approved" } });
  const requests: CliRequest[] = [];
  const opencode = async (request: CliRequest): Promise<CliResult> => {
    requests.push(request);
    return { ok: true, text: fencedJson({ stage: null, classification: null }), turns: 1, usageByModel: [] };
  };
  const factory = new Factory(tempDir("upstream-workflow-"), { backend: "cli", cli: "opencode", executors: { exec: fake.exec, opencode } });
  const { run } = factory.start("upstream", undefined, { workflow: "olko-marketplace-upstream", input: UPSTREAM_INPUT });
  factory.confirm(run.runId, { backend: { kind: "cli", cli: "opencode" } });
  await driveRun(factory, run.runId, { reply: () => undefined });
  const stage = requests.find((request) => request.prompt.includes("stage step"));
  assert.ok(stage, "the stage step ran");
  assert.ok(stage.dirs?.includes(PROJECT), "the stage step lists the project");
  assert.equal(stage.limitDirs, undefined, "no folder or tool limit without isolate");
});
