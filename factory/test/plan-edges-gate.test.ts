import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");
const { missingEdges } = await import("./edge-coverage.ts");

const GATE = "olko-plan-gate";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const PASS = "consistency | pass | 0 | none";
const FAIL = "consistency | fail | 1 | stack.md misses the queue dependency";
const RUNS: ReturnType<InstanceType<typeof Factory>["get"]>[] = [];

/** Replies like a gate whose consistency check passes on check `passOnCheck` (1-based). */
function gateReply(passOnCheck: number) {
  return (step: string, visit: number): string | undefined => {
    if (step === "stack") return "stack | none";
    if (step === "consistency") return visit === passOnCheck ? PASS : FAIL;
    if (step === "fix") return "fixed | stack.md";
    if (step === "record-gap") return "recorded | GAP-1";
    return undefined;
  };
}

async function drive(reply: (step: string, visit: number) => string | undefined) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-edges-gate-")), { backend: "delegate" });
  const { run } = factory.start("plan gate", undefined, { workflow: GATE, input: { project: "/repo", featureDir: "plans/features/f1" } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  const asked: string[] = [];
  for (let i = 0; i < 2000; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    if (view.status === "waiting_for_user") {
      asked.push(view.pendingQuestion!.id);
      factory.answer(run.runId, view.pendingQuestion!.id, "1");
    } else if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        const visit = (prompts[step] ??= []).push(work.prompt);
        const output = reply(step, visit);
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

test("a plan that passes the first check ends the gate without a correction", async () => {
  const { done, prompts, asked } = await drive(gateReply(1));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["stack"]!.length, 1);
  assert.equal(prompts["fix"], undefined);
  assert.equal(prompts["record-gap"], undefined);
  assert.deepEqual(asked, []);
});

test("a failed check sends the mismatches to the editor and refreshes stack.md before the next check", async () => {
  const { done, prompts } = await drive(gateReply(3));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["fix"]!.length, 2);
  assert.equal(prompts["stack"]!.length, 3, "every correction is followed by a stack refresh");
  assert.match(prompts["fix"]![0]!, /Mismatches: stack\.md misses the queue dependency/);
  assert.equal(prompts["record-gap"], undefined);
});

test("a check that still fails after three corrections records a GAP item and asks the user nothing", async () => {
  const { done, prompts, asked } = await drive(gateReply(Number.POSITIVE_INFINITY));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["consistency"]!.length, 4);
  assert.equal(prompts["fix"]!.length, 3);
  assert.equal(prompts["record-gap"]!.length, 1);
  assert.match(prompts["record-gap"]![0]!, /stack\.md misses the queue dependency/);
  assert.deepEqual(asked, []);
});

test("the scenarios above take every edge of the gate workflow", () => {
  assert.deepEqual(missingEdges(GATE, RUNS), []);
});
