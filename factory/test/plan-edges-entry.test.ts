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
const RUNS: ReturnType<InstanceType<typeof Factory>["get"]>[] = [];
const UNREACHABLE: Record<string, string> = {
  "entry-stop -> END": "entry-stop is a builtin.stop step: it always fails the run, so its edge to END is never taken",
};

function json(body: unknown): string {
  return `Reply.\n${FENCE}json\n${JSON.stringify(body)}\n${FENCE}`;
}

const CONTEXT = json({
  feature: { title: "Approval gate", goal: "A gated op waits for the user", criteria: ["A gated op does not run before the answer"] },
  tasks: [{ id: "T1", title: "Approval question", criteria: ["AC1: decline runs no op"] }],
  hierarchy: "- Feature: Approval gate\n  - T1: Approval question",
});
const PASSED = json({ ok: true, featureId: "f-1", featureDir: "plans/features/f-1", feature: "F", tasks: "T1", taskIds: ["T1"], criteria: "AC1", reason: "" });
const FAILED = json({ ok: false, featureId: "", featureDir: "", feature: "", tasks: "", taskIds: [], criteria: "", reason: "no Feature context" });

function stoppedBy(run: { status: string; events: { error?: unknown }[] }, reason: RegExp): boolean {
  return run.status === "failed" && run.events.some((e) => reason.test(String(e.error ?? "")));
}

async function drive(tracker: boolean, gate: string) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-edges-entry-")), { backend: "delegate" });
  const { run } = factory.start("plan entry", undefined, { workflow: "olko-plan-entry", input: { project: "/repo", featureId: "f-1", switches: { tracker } } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  for (let i = 0; i < 500; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    assert.notEqual(view.status, "waiting_for_user", `the entry asked the user: ${JSON.stringify(view.pendingQuestion)}`);
    if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        (prompts[step] ??= []).push(work.prompt);
        const output = step === "context" ? CONTEXT : step === "feature" ? gate : undefined;
        if (output === undefined) throw new Error(`unexpected step ${step}`);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const done = factory.get(run.runId);
  RUNS.push(done);
  return { done, prompts };
}

test("with the tracker on, the entry gate sees the Feature and Task criteria read from the tracker and passes", async () => {
  const { done, prompts } = await drive(true, PASSED);
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.match(prompts["context"]![0]!, /Read the Feature f-1/);
  assert.match(prompts["feature"]![0]!, /Feature context from the tracker[\s\S]*- Feature: Approval gate/);
  assert.match(prompts["feature"]![0]!, /- T1 Approval question: AC1: decline runs no op;/);
  assert.match(JSON.stringify(done.state), /"featureDir":"plans\/features\/f-1"/, "the plan folder is in the run state");
});

test("with the tracker off, the tracker is not read and a failed entry gate stops planning", async () => {
  const { done, prompts } = await drive(false, FAILED);
  assert.ok(stoppedBy(done, /Entry gate: no Feature context/), JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["context"], undefined);
  assert.doesNotMatch(prompts["feature"]![0]!, /Feature context from the tracker/);
});

test("the scenarios above take every edge of the entry workflow, except the unreachable ones", () => {
  assert.deepEqual(missingEdges("olko-plan-entry", RUNS).filter((edge) => !(edge in UNREACHABLE)), []);
});
