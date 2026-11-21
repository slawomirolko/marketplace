import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");

const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const FENCE = "`".repeat(3);

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

test("the consistency check and the grill see the Feature and Task criteria, and the writer sees the questions the answer refers to", async () => {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-discovery-")), { backend: "delegate" });
  const { run } = factory.start("plan discovery", undefined, { workflow: "olko-plan-discovery", input: { project: "/repo", idea: "approval gate", switches: { tracker: false } } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  for (let i = 0; i < 500; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    if (view.status === "waiting_for_user") {
      const id = view.pendingQuestion!.id;
      factory.answer(run.runId, id, id.includes("draft-review") ? "approve" : "Use your recommended answer for every question.");
    } else if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        const visit = (prompts[step] ??= []).push(work.prompt);
        const output =
          step === "draft" ? (visit === 1 ? draft(["Q1: Which ops are gated?"], []) : draft([], ["L1: only script ops are gated"]))
          : step === "draft-consistency" ? "consistency | pass | 0 | none"
          : step === "questions-grill" ? "Q1: Which ops are gated?"
          : step === "review-grill" ? "Approve or revise?"
          : undefined;
        if (output === undefined) throw new Error(`unexpected step ${step}`);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const done = factory.get(run.runId);
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  for (const step of ["draft-consistency", "questions-grill", "review-grill"]) {
    assert.match(prompts[step]![0]!, /- A gated op does not run before the answer/, `${step} sees the Feature criteria`);
    assert.match(prompts[step]![0]!, /- T1: Approval question\s+- AC1: decline runs no op/, `${step} sees the Task criteria`);
  }
  assert.match(prompts["draft"]![1]!, /The question batch you returned last time[\s\S]*- Q1: Which ops are gated\?[\s\S]*Use your recommended answer/);
});
