import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runSubagent } from "./delegate-subagent.ts";
import { FENCE } from "./helpers/plan-driver.ts";
import { tempDir } from "./helpers/temp.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
const IDEA = "Add approval gates to the skill factory: a script node can declare approval: required, and the engine asks the user before it runs the operation and records the answer in the run.";
const LIMIT_MS = 5 * 60 * 1000;

type Scripted = Record<string, string>;

let projectCopy: string | undefined;

/**
 * The project the agents read: FACTORY_CONTRACT_PROJECT when set, otherwise a shallow clone of this repository's
 * committed tree in the temp folder (made once, removed after the file), so agents never run in the developer checkout.
 */
function contractProject(): string {
  if (process.env.FACTORY_CONTRACT_PROJECT) {
    return process.env.FACTORY_CONTRACT_PROJECT;
  }
  if (!projectCopy) {
    projectCopy = path.join(tempDir("factory-plan-contract-project-", { real: true }), "project");
    execFileSync("git", ["clone", "-q", "--depth", "1", pathToFileURL(path.join(factoryDir, "..")).href, projectCopy]);
  }
  return projectCopy;
}

function fixture(name: string): string {
  const body = fs.readFileSync(path.join(factoryDir, "test", "fixtures", "plan-discovery", `${name}.json`), "utf8");
  return `Draft.\n${FENCE}json\n${body}\n${FENCE}`;
}

/** Drives the discovery workflow with scripted replies up to `target`, runs that one node on the real model, and returns its parsed state and raw reply. */
async function contract(target: string, scripted: Scripted): Promise<{ parsed: any; output: string; retried: boolean }> {
  const project = contractProject();
  const factory = new Factory(tempDir("factory-plan-contract-"), { backend: "delegate" });
  const { run } = factory.start("plan discovery contract", undefined, { workflow: "olko-plan-discovery", input: { project, idea: IDEA, switches: { tracker: false } } });
  factory.confirm(run.runId, { tierModels: { low: MODEL, medium: MODEL, high: MODEL } });
  try {
    for (let i = 0; i < 2000; i++) {
      const view = factory.status(factory.get(run.runId));
      assert.equal(view.status === "waiting_for_user", false, `the run asked the user before it reached ${target}`);
      assert.notEqual(view.status, "failed", JSON.stringify(factory.get(run.runId).events.at(-1)));
      const work = view.status === "waiting_for_client" ? view.pendingWorkItems?.[0] : undefined;
      if (!work) {
        await new Promise((r) => setTimeout(r, 5));
        continue;
      }
      const step = work.nodePath.split("/").pop()!;
      if (step !== target) {
        assert.ok(scripted[step] !== undefined, `no scripted reply for ${step} on the way to ${target}`);
        factory.submit(run.runId, work.nodePath, scripted[step]!, { model: MODEL, inputTokens: 1, outputTokens: 1 }, work.agentId);
        continue;
      }
      let result = await runSubagent(work, { cwd: project });
      factory.submit(run.runId, work.nodePath, result.output, result.usage, work.agentId);
      const again = factory.status(factory.get(run.runId)).pendingWorkItems?.find((w) => w.nodePath === work.nodePath && w.retried);
      if (again) {
        result = await runSubagent(again, { cwd: project });
        factory.submit(run.runId, again.nodePath, result.output, result.usage, again.agentId);
      }
      const parsed = (factory.get(run.runId).state?.[target] as Record<string, unknown> | undefined)?.[work.agentId];
      return { parsed, output: result.output, retried: Boolean(again) };
    }
    throw new Error(`the run never offered ${target}`);
  } finally {
    factory.cancel(run.runId);
  }
}

test("each discovery node keeps its output contract on the real model", { concurrency: true, timeout: LIMIT_MS }, async (t) => {
  await Promise.all([
    t.test("draft: the first draft ends with the json block the parser reads", async () => {
      const { parsed } = await contract("draft", {});
      assert.ok(Array.isArray(parsed.questions) && Array.isArray(parsed.decisions) && Array.isArray(parsed.tasks), "questions, decisions and tasks are lists");
      assert.equal(typeof parsed.feature, "object", "the Feature is an object");
      assert.ok(parsed.questions.length + parsed.tasks.length > 0, "the draft has open questions or Tasks");
    }),
    t.test("draft-consistency: decisions that name files and tests the Tasks leave out do not fail the check", async () => {
      const { parsed, output } = await contract("draft-consistency", { draft: fixture("draft-with-decisions") });
      assert.match(parsed.verdict, /^(pass|fail)$/, output);
      assert.match(parsed.count, /^\d+$/, output);
      assert.doesNotMatch(parsed.detail, /tests?\b[^;]*\bnot named/i, "a test the Task text does not name is not a finding");
      assert.ok(parsed.verdict === "pass" || Number(parsed.count) <= 1, `expected pass or one finding, got: ${parsed.detail}`);
    }),
    t.test("questions-grill: the whole batch of open questions is in one reply", async () => {
      const { parsed } = await contract("questions-grill", { draft: fixture("draft-with-open-questions"), "draft-consistency": "consistency | pass | 0 | none" });
      const headings = String(parsed).split(/\r?\n/).filter((line) => /^#{1,3}\s/.test(line));
      assert.ok(headings.length >= 7, `7 questions expected, reply was:
${String(parsed)}`);
      assert.doesNotMatch(String(parsed), /one per turn|remaining in this decision set|after this answer/i, "no question is held back for a later turn");
    }),
  ]);
});
