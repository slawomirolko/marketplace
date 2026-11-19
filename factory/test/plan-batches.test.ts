import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");

const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const FENCE = "`".repeat(3);

function questions(prefix: string, count: number): string {
  const items = Array.from({ length: count }, (_, i) => ({ text: `${prefix} ${i + 1}\n1. keep (recommended)\n2. change\n3. drop` }));
  return `Batch.\n${FENCE}json\n${JSON.stringify({ questions: items })}\n${FENCE}`;
}

function commonReply(step: string): string | undefined {
  if (step === "stack") return "stack | none";
  if (step === "consistency") return "consistency | pass | 0 | none";
  if (step === "revalidate") return "findings | none | 0 | none";
  return undefined;
}

async function drive(workflow: string, reply: (step: string, visit: number) => string, answerFor: (id: string) => string) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-batches-")), { backend: "delegate" });
  const { run } = factory.start("plan batches", undefined, { workflow, input: { project: "/repo" } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  const asked: string[] = [];
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
        const output = commonReply(step) ?? reply(step, prompts[step].length);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  return { done: factory.get(run.runId), prompts, asked };
}

test("a grill batch is recorded in tracker.md by one step after every question of the batch is answered, and the next batch starts a new list", async () => {
  const reply = (step: string, visit: number) => {
    if (step === "grill") return visit === 1 ? questions("First-batch question", 3) : visit === 2 ? questions("Follow-up question", 2) : questions("none", 0);
    if (step === "grill-record") return "recorded | batch";
    if (step === "grill-apply") return "applied";
    throw new Error(`unexpected step ${step}`);
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

test("a blocker batch is recorded in tracker.md by one step after every blocker of the batch is answered", async () => {
  const reply = (step: string, visit: number) => {
    if (step === "cleanup") return "cleaned";
    if (step === "readiness") return visit === 1 ? questions("Blocker GAP-1", 2) : questions("none", 0);
    if (step === "blocker-record") return "recorded | batch";
    if (step === "blocker-apply") return "applied";
    throw new Error(`unexpected step ${step}`);
  };
  const { done, prompts, asked } = await drive("olko-plan-readiness", reply, () => "1");
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(asked.length, 2);
  const records = prompts["blocker-record"] ?? [];
  assert.equal(records.length, 1, "one record step for the whole blocker batch");
  assert.match(records[0]!, /Blocker 1:\s+Blocker GAP-1 1[\s\S]*Blocker 2:\s+Blocker GAP-1 2[\s\S]*The user's decision: option 1\./);
});

test("the consistency check does not count a mismatch already recorded as a GAP item", async () => {
  const { prompts } = await drive("olko-plan-gate", () => "unused", () => "1");
  assert.match(prompts["consistency"]?.[0] ?? "", /already recorded as an open GAP-<n> item or as an ACCEPTED-GAP in tracker\.md is not a mismatch/);
});
