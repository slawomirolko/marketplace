import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory, loadedWorkflows } = await import("../src/engine.ts");
const { loadWorkflowDir } = await import("../src/workflow-yaml.ts");

const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const FENCE = "`".repeat(3);

function questions(prefix: string, count: number): string {
  const items = Array.from({ length: count }, (_, i) => ({ text: `${prefix} ${i + 1}\n1. keep (recommended)\n2. change\n3. drop` }));
  return `Batch.\n${FENCE}json\n${JSON.stringify({ questions: items })}\n${FENCE}`;
}

function applied(changes: string[], areas: string[]): string {
  return `Applied.
${FENCE}json
${JSON.stringify({ changes, areas })}
${FENCE}`;
}

function commonReply(step: string): string | undefined {
  if (step === "stack") return "stack | none";
  if (step === "consistency") return "consistency | pass | 0 | none";
  if (step === "revalidate") return "findings | none | 0 | none";
  return undefined;
}

async function drive(workflow: string, reply: (step: string, visit: number, agentId?: string) => string | undefined, answerFor: (id: string) => string) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-batches-")), { backend: "delegate" });
  const { run } = factory.start("plan batches", undefined, { workflow, input: { project: "/repo" } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  const asked: string[] = [];
  const agents: Record<string, string[]> = {};
  for (let i = 0; i < 5000; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    if (view.status === "waiting_for_user") {
      const id = view.pendingQuestion!.id;
      asked.push(id);
      factory.answer(run.runId, id, answerFor(id));
    } else if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        (prompts[step] ??= []).push(work.prompt);
        (agents[step] ??= []).push(work.agentId);
        const output = reply(step, prompts[step].length, work.agentId) ?? commonReply(step);
        if (output === undefined) throw new Error(`unexpected step ${step}`);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  return { done: factory.get(run.runId), prompts, asked, agents };
}

test("a grill batch is recorded in tracker.md by one step after every question of the batch is answered, and the next batch starts a new list", async () => {
  let batch = "";
  const reply = (step: string, visit: number) => {
    if (step === "grill") return (batch = visit === 1 ? questions("First-batch question", 3) : visit === 2 ? questions("Follow-up question", 2) : questions("none", 0));
    if (step === "grill-review") return batch;
    if (step === "grill-record") return "recorded | batch";
    if (step === "grill-apply") return applied([], []);
    return undefined;
  };
  const { done, prompts, asked } = await drive("olko-plan-grill", reply, (id) => (id.endsWith("-1") ? "2" : "1"));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(asked.length, 5, "every question is still asked one at a time");
  const records = prompts["grill-record"] ?? [];
  assert.equal(records.length, 2, "one record step per batch, not one per answer");
  for (const n of [1, 2, 3]) assert.match(records[0]!, new RegExp(`First-batch question ${n}`));
  assert.match(records[0]!, /Question 2:\s+First-batch question 2[\s\S]*The user's answer: option 2\./);
  assert.doesNotMatch(records[1]!, /First-batch question/, "a new batch starts a new list");
  assert.match(records[1]!, /Follow-up question 1[\s\S]*Follow-up question 2/);
  assert.equal(prompts["grill-apply"]?.length, 2);
});

test("re-validation runs only the workers whose area the applied answers changed, checks only the changed claims, and is skipped when no claim changed", async () => {
  let batch = "";
  const reply = (step: string, visit: number, agentId?: string) => {
    if (step === "grill") return (batch = visit === 1 ? questions("First", 1) : visit === 2 ? questions("Second", 1) : questions("none", 0));
    if (step === "grill-review") return batch;
    if (step === "grill-record") return "recorded | 1";
    if (step === "grill-apply") return visit === 1 ? applied(["implementation.md: the gate runs before the operation"], ["flow", "test"]) : applied([], []);
    if (step === "revalidate") return agentId === "flow" ? "findings | found | 1 | the gate runs after the operation" : "findings | none | 0 | none";
    if (step === "fold-reval") return "folded";
    return undefined;
  };
  const { done, prompts, agents } = await drive("olko-plan-grill", reply, () => "1");
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(agents["revalidate"], ["flow", "test"], "only the flow and test workers run, and only in the first round");
  assert.match(prompts["revalidate"]![0]!, /- implementation.md: the gate runs before the operation/);
  assert.equal(prompts["fold-reval"]?.length, 1, "a finding of the first round is not folded again in the second round");
  assert.ok(done.events.some((e: any) => e.type === "node_skipped" && String(e.node).endsWith("/revalidate")), "the second round skips re-validation");
});

// olko-plan-readiness runs as a group inside olko-plan-documentation and reads the Feature (featureDir, taskIds)
// that olko-plan-entry put in the shared state. This wrapper supplies that Feature state for one Task.
function withFeatureWrapper(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-readiness-wrapper-"));
  const source = path.join(import.meta.dirname, "..", "workflows");
  for (const file of fs.readdirSync(source)) if (file.endsWith(".yaml")) fs.copyFileSync(path.join(source, file), path.join(dir, file));
  fs.writeFileSync(
    path.join(dir, "test-plan-readiness.yaml"),
    [
      "name: test-plan-readiness",
      "version: 0.0.1",
      'description: "Test wrapper: supplies the Feature state, then runs olko-plan-readiness as a group."',
      'source: "factory/test/plan-batches.test.ts"',
      "roles:",
      "  plan-gate: medium",
      "  planner: high",
      "  runner: medium",
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
  const wrapper = loadWorkflowDir(dir).get("test-plan-readiness");
  if (!wrapper) throw new Error("test wrapper did not load");
  loadedWorkflows().set("test-plan-readiness", wrapper);
  return "test-plan-readiness";
}

test("a blocker batch is recorded in tracker.md by one step after every blocker of the batch is answered", async () => {
  let batch = "";
  const reply = (step: string, visit: number) => {
    if (step === "feature") return `${FENCE}json\n${JSON.stringify({ featureDir: "plans/features/F-1", taskIds: ["T-1"], tasks: "T-1: AC-1", feature: "F-1" })}\n${FENCE}`;
    if (step === "e2e-matrix") return "plans/features/F-1/e2e/T-1.acceptance.json\nAC-1 | scenario | ok | screenshot";
    if (step === "e2e-validate") return "validation | pass | /repo/plans/features/F-1/e2e/T-1.acceptance.json | none";
    if (step === "e2e-fold") return "e2e | T-1 | pass";
    if (step === "cleanup") return "cleaned";
    if (step === "readiness") return (batch = visit === 1 ? questions("Blocker GAP-1", 2) : questions("none", 0));
    if (step === "readiness-review") return batch;
    if (step === "blocker-record") return "recorded | batch";
    if (step === "blocker-apply") return "applied";
    return undefined;
  };
  const { done, prompts, asked } = await drive(withFeatureWrapper(), reply, () => "1");
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(asked.length, 2);
  const records = prompts["blocker-record"] ?? [];
  assert.equal(records.length, 1, "one record step for the whole blocker batch");
  assert.match(records[0]!, /Blocker 1:\s+Blocker GAP-1 1[\s\S]*Blocker 2:\s+Blocker GAP-1 2[\s\S]*The user's decision: option 1\./);
});

test("the consistency check does not count a mismatch already recorded as a GAP item", async () => {
  const { prompts } = await drive("olko-plan-gate", () => undefined, () => "1");
  assert.match(prompts["consistency"]?.[0] ?? "", /already recorded as an open GAP-<n> item or as an ACCEPTED-GAP in tracker\.md is not a mismatch/);
});
