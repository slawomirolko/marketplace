import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");

const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const FENCE = "`".repeat(3);
const RECOMMENDED = "Use your recommended answer for every question.";

function draft(questions: string[], decisions: string[]): string {
  const body = {
    questions,
    decisions,
    feature: { title: "Approval gate", goal: "A gated op waits for the user", criteria: ["A gated op does not run before the answer"] },
    tasks: [{ id: "T1", title: "Approval question", criteria: ["AC1: decline runs no op"] }],
    hierarchy: "- Feature: Approval gate\n  - T1: Approval question",
  };
  return `Draft.\n${FENCE}json\n${JSON.stringify(body)}\n${FENCE}`;
}

async function drive(reply: (step: string, visit: number) => string | undefined) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-discovery-")), { backend: "delegate" });
  const { run } = factory.start("plan discovery", undefined, { workflow: "olko-plan-discovery", input: { project: "/repo", idea: "approval gate", switches: { tracker: false } } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  const asked: string[] = [];
  for (let i = 0; i < 500; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    if (view.status === "waiting_for_user") {
      const id = view.pendingQuestion!.id;
      asked.push(id);
      factory.answer(run.runId, id, id.includes("draft-review") ? "approve" : RECOMMENDED);
    } else if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        const visit = (prompts[step] ??= []).push(work.prompt);
        const output = reply(step, visit) ?? (step === "review-grill" ? "Approve or revise?" : undefined);
        if (output === undefined) throw new Error(`unexpected step ${step}`);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  return { done: factory.get(run.runId), prompts, asked };
}

test("the consistency check and the grill see the Feature and Task criteria, and the writer sees the questions the answer refers to", async () => {
  const { done, prompts } = await drive((step, visit) => {
    if (step === "draft") return visit === 1 ? draft(["Q1: Which ops are gated?"], []) : draft([], ["L1: only script ops are gated"]);
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    if (step === "questions-grill") return "Question 1: Which ops are gated?";
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  for (const step of ["draft-consistency", "questions-grill", "review-grill"]) {
    assert.match(prompts[step]![0]!, /- A gated op does not run before the answer/, `${step} sees the Feature criteria`);
    assert.match(prompts[step]![0]!, /- T1: Approval question\s+- AC1: decline runs no op/, `${step} sees the Task criteria`);
  }
  assert.match(prompts["draft"]![1]!, /The question batch put to the user[\s\S]*Question 1: Which ops are gated\?[\s\S]*Use your recommended answer/);
});

test("a decision once locked stays locked when a later draft leaves it out", async () => {
  const { done, prompts } = await drive((step, visit) => {
    if (step === "draft") return visit === 1 ? draft(["Q1"], []) : visit === 2 ? draft(["Q2"], ["L1: only script ops are gated"]) : draft([], []);
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    if (step === "questions-grill") return "Question";
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.match(prompts["draft"]![2]!, /Locked decisions so far[^\n]*\n\s*- L1: only script ops are gated/, "the writer gets the decision back after dropping it");
  assert.match(prompts["review-grill"]![0]!, /L1: only script ops are gated/, "the review shows the kept decision");
});

test("two consistency failures in a row put the findings to the user instead of looping back to the writer", async () => {
  const { done, prompts, asked } = await drive((step, visit) => {
    if (step === "draft") return visit <= 2 ? draft([], ["L1: only script ops are gated"]) : draft([], ["L1: only script ops are gated", "L2: decline stops the run"]);
    if (step === "draft-consistency") return visit <= 2 ? "consistency | fail | 1 | L2 unclear\nThe draft leaves decline behaviour open: stop or skip?" : "consistency | pass | 0 | none";
    if (step === "questions-grill") return "Question 1: On decline, stop or skip?";
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["draft"]!.length, 3, "first draft, one repair, then the draft after the user's answer");
  assert.match(prompts["draft"]![1]!, /The last consistency check of your draft \(its full reply\):[\s\S]*decline behaviour open: stop or skip\?/, "the writer gets the full reply of the check");
  assert.match(prompts["questions-grill"]![0]!, /failed the consistency check 2 times in a row[\s\S]*decline behaviour open/);
  assert.equal(asked.filter((id) => id.includes("questions")).length, 1);
});
