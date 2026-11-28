import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { tempDir } from "./helpers/temp.ts";
import { driveWorkflow, fencedJson, type PlanRun } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { loadedWorkflows } = await import("../src/engine.ts");
const { loadWorkflowDir } = await import("../src/workflow-yaml.ts");
const { missingEdges, SCENARIOS_FILTERED } = await import("./edge-coverage.ts");

const json = (body: unknown): string => fencedJson(body, "Reply.");

const WRAPPER = "test-plan-readiness-edges";
const TASKS = ["T-1", "T-2"];
const RUNS: PlanRun[] = [];

type Gate = "gate-cleanup" | "gate-blocker";
type Scenario = { blockers?: number[]; rejectAll?: boolean; failingGate?: Gate };

/** Registers a wrapper that supplies the Feature state the readiness phase reads, then runs olko-plan-readiness as a group with its own node ids. */
function registerWrapper(): void {
  const dir = tempDir("factory-plan-edges-readiness-wrapper-");
  const source = path.join(import.meta.dirname, "..", "workflows");
  for (const file of fs.readdirSync(source)) if (file.endsWith(".yaml")) fs.copyFileSync(path.join(source, file), path.join(dir, file));
  fs.writeFileSync(
    path.join(dir, `${WRAPPER}.yaml`),
    [
      `name: ${WRAPPER}`,
      "version: 0.0.1",
      'description: "Test wrapper: supplies the Feature state, then runs olko-plan-readiness as a group."',
      'source: "factory/test/plan-edges-readiness.test.ts"',
      "roles:",
      "  plan-gate: medium",
      "entry: feature",
      "nodes:",
      "  - id: feature",
      '    description: "Supplies the Feature folder and its Task ids."',
      "    kind: llm",
      "    role: plan-gate",
      "    parse: { json: [featureDir, taskIds, tasks, feature] }",
      '    prompt: "feature"',
      "  - id: readiness-phase",
      '    description: "The readiness phase under test."',
      "    kind: group",
      "    workflow: olko-plan-readiness",
      "edges:",
      "  - { from: feature, to: readiness-phase }",
      "  - { from: readiness-phase, to: END }",
      "",
    ].join("\n"),
  );
  const wrapper = loadWorkflowDir(dir).get(WRAPPER);
  if (!wrapper) throw new Error("test wrapper did not load");
  loadedWorkflows().set(WRAPPER, wrapper);
}

registerWrapper();

function questions(count: number, round: number): string {
  return json({ questions: Array.from({ length: count }, (_, i) => ({ text: `Blocker GAP-${round}.${i + 1}\n1. accept (recommended)\n2. correct\n3. keep blocking` })) });
}

function reply(key: string, visit: number, last: Record<string, string>, { blockers = [], rejectAll = false, failingGate }: Scenario): string {
  const [gate, step] = key.includes("/") ? key.split("/") : [undefined, key];
  if (step === "feature") return json({ featureDir: "plans/features/f-1", taskIds: TASKS, tasks: "T-1: AC-1\nT-2: AC-2", feature: "F-1" });
  if (step === "cleanup") return "cleaned";
  if (step === "stack") return "stack | none";
  if (step === "consistency") return gate === failingGate ? "consistency | fail | 1 | stack.md misses the queue dependency" : "consistency | pass | 0 | none";
  if (step === "fix") return "fixed | stack.md";
  if (step === "record-gap") return "recorded | GAP-1";
  if (step === "e2e-matrix") return "plans/features/f-1/e2e/T.acceptance.json\nAC-1 | scenario | ok | screenshot";
  if (step === "e2e-validate") return "validation | pass | /repo/plans/features/f-1/e2e/T.acceptance.json | none";
  if (step === "e2e-fold") return "e2e | T | pass";
  if (step === "readiness") return questions(blockers[visit - 1] ?? 0, visit);
  if (step === "readiness-review") return rejectAll ? json({ questions: [] }) : last["readiness"]!;
  if (step === "blocker-record") return "recorded | batch";
  if (step === "blocker-apply") return "applied";
  throw new Error(`unexpected step ${key}`);
}

async function drive(scenario: Scenario = {}) {
  const last: Record<string, string> = {};
  return driveWorkflow({
    workflow: WRAPPER,
    goal: "plan readiness",
    input: { project: "/repo" },
    tempPrefix: "factory-plan-edges-readiness-",
    visitKey: ({ nodePath }) => nodePath.slice(WRAPPER.length + 1),
    reply: ({ nodePath, visit }) => {
      const key = nodePath.slice(WRAPPER.length + 1);
      return (last[key] = reply(key, visit, last, scenario));
    },
    answer: () => "1",
    runs: RUNS,
  });
}

test("when every plan is ready after the cleanup, each Task manifest is written and validated once and nothing is asked", async () => {
  const { done, prompts, asked } = await drive();
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, []);
  assert.equal(prompts["e2e-matrix"]?.length, TASKS.length);
  TASKS.forEach((task, i) => assert.match(prompts["e2e-matrix"]![i]!, new RegExp(`Task ${task} in the project /repo`)));
  assert.match(prompts["e2e-fold"]![0]!, /Runner verdict: pass for \/repo\/plans\/features\/f-1\/e2e\/T\.acceptance\.json/);
  assert.equal(prompts["readiness"]?.length, 1);
  assert.equal(prompts["readiness-review"], undefined, "no batch goes to the question reviewer");
});

test("a consistency gate after the cleanup that still fails after three corrections records a GAP item and the run goes on to the manifests", async () => {
  const { done, prompts, asked } = await drive({ failingGate: "gate-cleanup" });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, [], "the gate asks nothing");
  assert.equal(prompts["gate-cleanup/consistency"]?.length, 4);
  assert.equal(prompts["gate-cleanup/fix"]?.length, 3);
  assert.match(prompts["gate-cleanup/record-gap"]![0]!, /stack\.md misses the queue dependency/);
  assert.equal(prompts["e2e-matrix"]?.length, TASKS.length);
});

test("a question reviewer that rejects every blocker question ends the run without asking the user", async () => {
  const { done, prompts, asked } = await drive({ blockers: [2], rejectAll: true });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, []);
  assert.match(prompts["readiness-review"]![0]!, /Blocker GAP-1\.1/);
  assert.equal(prompts["blocker-record"], undefined);
});

test("three answered blocker batches end the run at the fourth round without a fourth readiness read, and every batch validates the manifests again", async () => {
  const { done, prompts, asked } = await drive({ blockers: [1, 2, 1, 1] });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, ["q-plan-blocker-1-0", "q-plan-blocker-2-0", "q-plan-blocker-2-1", "q-plan-blocker-3-0"]);
  assert.equal(prompts["readiness"]?.length, 3);
  assert.equal(prompts["blocker-record"]?.length, 3, "one record step per batch");
  assert.match(prompts["blocker-record"]![1]!, /Blocker 1:\s+Blocker GAP-2\.1[\s\S]*Blocker 2:\s+Blocker GAP-2\.2[\s\S]*The user's decision: option 1\./);
  assert.equal(prompts["gate-blocker/consistency"]?.length, 3);
  assert.equal(prompts["e2e-matrix"]?.length, TASKS.length * 4, "the first pass and one per batch");
});

test("a consistency gate after the blocker decisions that keeps failing records a GAP item and the manifests are validated again", async () => {
  const { done, prompts, asked } = await drive({ blockers: [1], failingGate: "gate-blocker" });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, ["q-plan-blocker-1-0"]);
  assert.equal(prompts["gate-blocker/fix"]?.length, 3);
  assert.equal(prompts["gate-blocker/record-gap"]?.length, 1);
  assert.equal(prompts["e2e-matrix"]?.length, TASKS.length * 2);
  assert.equal(prompts["readiness"]?.length, 2, "the readiness is read again after the GAP item");
});

test("the scenarios above take every edge of the readiness workflow", { skip: SCENARIOS_FILTERED }, () => {
  assert.deepEqual(missingEdges("olko-plan-readiness", RUNS), []);
});
