import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");
const { missingEdges } = await import("./edge-coverage.ts");

const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const FENCE = "`".repeat(3);
const RECOMMENDED = "Use your recommended answer for every question.";
const BLOCKER = "blocker | grill-with-docs cannot be loaded";
const RUNS: ReturnType<InstanceType<typeof Factory>["get"]>[] = [];

function stoppedBy(run: { status: string; events: { error?: unknown }[] }, reason: RegExp): boolean {
  return run.status === "failed" && run.events.some((e) => reason.test(String(e.error ?? "")));
}

function defaultAnswer(id: string): string {
  return id.includes("draft-review") ? "approve" : RECOMMENDED;
}

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

async function drive(reply: (step: string, visit: number) => string | undefined, { tracker = false, answer = defaultAnswer }: { tracker?: boolean; answer?: (id: string) => string } = {}) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-discovery-")), { backend: "delegate" });
  const { run } = factory.start("plan discovery", undefined, { workflow: "olko-plan-discovery", input: { project: "/repo", idea: "approval gate", switches: { tracker } } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  const asked: string[] = [];
  for (let i = 0; i < 500; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    if (view.status === "waiting_for_user") {
      const id = view.pendingQuestion!.id;
      asked.push(id);
      factory.answer(run.runId, id, answer(id));
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
  const done = factory.get(run.runId);
  RUNS.push(done);
  return { done, prompts, asked };
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

test("the consistency check does not fail a decision for a file or test the Task text leaves out, and the grill puts the whole batch in one reply", async () => {
  const { done, prompts } = await drive((step, visit) => {
    if (step === "draft") return visit === 1 ? draft(["Q1", "Q2"], []) : draft([], ["L1: only script ops are gated. Artifacts: engine unit tests"]);
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    if (step === "questions-grill") return "Question 1\nQuestion 2";
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.match(prompts["draft-consistency"]![0]!, /a file or test that the Feature and Task text does not name is not a failure/);
  assert.match(prompts["questions-grill"]![0]!, /put every listed question in this one reply[\s\S]*- Q1\s+- Q2/);
  assert.match(prompts["questions-grill"]![0]!, /ask nothing about how far an earlier answer of the user reaches/);
  assert.match(prompts["draft"]![1]!, /answers each question of that batch/);
});

test("a reply the parser rejects is asked for once more with the error, and the run goes on", async () => {
  const { done, prompts } = await drive((step, visit) => {
    if (step === "draft") return visit === 1 ? "Draft without the block." : draft([], []);
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["draft"]!.length, 2);
  assert.match(prompts["draft"]![1]!, /Your previous reply was rejected: the agent output has no ```json block/);
  assert.equal(done.events.filter((e) => e.type === "node_started" && e.node?.endsWith("/draft")).length, 1, "the retry is the same visit of the node");
});

test("a second rejected reply in a row fails the run", async () => {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-discovery-")), { backend: "delegate" });
  const { run } = factory.start("plan discovery", undefined, { workflow: "olko-plan-discovery", input: { project: "/repo", idea: "approval gate", switches: { tracker: false } } });
  factory.confirm(run.runId);
  let work = factory.next(run.runId);
  for (let i = 0; i < 200 && !work; i++) {
    await new Promise((r) => setTimeout(r, 5));
    work = factory.next(run.runId);
  }
  assert.ok(work, "the draft work is offered");
  factory.submit(run.runId, work.nodePath, "no block", {}, work.agentId);
  assert.equal(factory.get(run.runId).status, "waiting_for_client");
  assert.throws(() => factory.submit(run.runId, work.nodePath, "still no block", {}, work.agentId), /no ```json block/);
  assert.equal(factory.get(run.runId).status, "failed");
});

test("a grill that cannot load its skill stops the run without asking the user", async () => {
  for (const grill of ["questions-grill", "review-grill", "revise-grill"]) {
    const { done, asked } = await drive((step) => {
      if (step === "draft") return grill === "questions-grill" ? draft(["Q1"], []) : draft([], []);
      if (step === "draft-consistency") return "consistency | pass | 0 | none";
      if (step === grill) return BLOCKER;
      return undefined;
    }, { answer: (id) => (id.includes("draft-review") ? "revise" : RECOMMENDED) });
    assert.ok(stoppedBy(done, /grill-with-docs cannot be loaded/), `${grill}: ${JSON.stringify(done.events.at(-1))}`);
    assert.equal(asked.length, grill === "revise-grill" ? 1 : 0, `${grill} asks nothing after the blocker`);
  }
});

test("a revise answer asks what should change and sends the change back to the writer", async () => {
  let reviews = 0;
  const { done, prompts } = await drive((step) => {
    if (step === "draft") return draft([], ["L1: only script ops are gated"]);
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    if (step === "revise-grill") return "What should change?";
    return undefined;
  }, { answer: (id) => (id.includes("draft-review") ? (reviews++ === 0 ? "revise" : "approve") : "Split T1 into two Tasks.") });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.match(prompts["draft"]![1]!, /requested change to the draft[\s\S]*Split T1 into two Tasks\./);
});

test("with the tracker on, the approved draft is published only after the publish and the existing-issue approvals", async () => {
  const { done, prompts } = await drive((step) => {
    if (step === "draft") return draft([], []);
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    if (step === "publish-grill") return "Publish or skip?";
    if (step === "existing-grill") return "Approve changes to existing issues?";
    if (step === "publish") return "Published: T1";
    return undefined;
  }, { tracker: true, answer: (id) => (id.includes("draft-review") ? "approve" : id === "q-plan-publish" ? "publish" : "new-only") });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["publish"]!.length, 1);
});

test("with the tracker on, skip publishes nothing", async () => {
  const { done, prompts } = await drive((step) => {
    if (step === "draft") return draft([], []);
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    if (step === "publish-grill") return "Publish or skip?";
    return undefined;
  }, { tracker: true, answer: (id) => (id.includes("draft-review") ? "approve" : "skip") });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["publish"], undefined);
});

test("a publish grill that cannot load its skill stops the run before anything is published", async () => {
  for (const grill of ["publish-grill", "existing-grill"]) {
    const { done, prompts } = await drive((step) => {
      if (step === "draft") return draft([], []);
      if (step === "draft-consistency") return "consistency | pass | 0 | none";
      if (step === "publish-grill") return grill === step ? BLOCKER : "Publish or skip?";
      if (step === "existing-grill") return BLOCKER;
      return undefined;
    }, { tracker: true, answer: (id) => (id.includes("draft-review") ? "approve" : "publish") });
    assert.ok(stoppedBy(done, /grill-with-docs cannot be loaded/), `${grill}: ${JSON.stringify(done.events.at(-1))}`);
    assert.equal(prompts["publish"], undefined);
  }
});

function emptyDraft(part: "feature" | "tasks"): string {
  const body = JSON.parse(draft([], ["L1: only script ops are gated"]).split("\n")[2]!);
  if (part === "feature") body.feature = { title: "", goal: "", criteria: [] };
  else body.tasks = [];
  return `Draft.\n${FENCE}json\n${JSON.stringify(body)}\n${FENCE}`;
}

test("a final draft without a Feature title or without a Task goes back to the writer before the review", async () => {
  for (const part of ["feature", "tasks"] as const) {
    const { done, prompts } = await drive((step, visit) => {
      if (step === "draft") return visit === 1 ? emptyDraft(part) : draft([], ["L1: only script ops are gated"]);
      if (step === "draft-consistency") return "consistency | pass | 0 | none";
      return undefined;
    });
    assert.equal(done.status, "done", `${part}: ${JSON.stringify(done.events.at(-1))}`);
    assert.equal(prompts["draft"]!.length, 2, `${part}: the writer returns the full draft once more`);
    assert.match(prompts["draft"]![1]!, /Your last draft listed no open question and (no Task|the Feature had no title)\. [\s\S]*Return the full draft again\./, part);
    assert.doesNotMatch(prompts["draft"]![0]!, /Your last draft/, "the first draft has no such note");
    assert.equal(prompts["review-grill"]!.length, 1, `${part}: only the full draft is reviewed`);
  }
});

test("a second final draft in a row without a Task stops discovery before the review", async () => {
  const { done, prompts } = await drive((step) => {
    if (step === "draft") return emptyDraft("tasks");
    if (step === "draft-consistency") return "consistency | pass | 0 | none";
    return undefined;
  });
  assert.ok(stoppedBy(done, /final draft without a Feature title or without a Task twice in a row/), JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["draft"]!.length, 2);
  assert.equal(prompts["review-grill"], undefined);
});

test("the scenarios above take every edge of the discovery workflow", () => {
  assert.deepEqual(missingEdges("olko-plan-discovery", RUNS), []);
});
