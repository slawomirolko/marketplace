import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");

const GATE = "olko-plan-gate";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);

function replyFor(nodePath: string, checks: number, passOnCheck: number): string {
  const step = nodePath.split("/").pop();
  if (step === "stack") return "stack | none";
  if (step === "consistency") return checks === passOnCheck ? "consistency | pass | 0 | none" : "consistency | fail | 1 | implementation.md open item cites the wrong ordered action";
  if (step === "fix") return "fixed | implementation.md";
  if (step === "record-gap") return "recorded | GAP-1";
  throw new Error(`unexpected step ${nodePath}`);
}

async function driveGate(passOnCheck: number) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-gate-")), { backend: "delegate" });
  const { run } = factory.start("check the plan package", undefined, { workflow: GATE, input: { project: "/repo", featureDir: "plans/features/f1" } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  let checks = 0;
  for (let i = 0; i < 2000; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    assert.notEqual(view.status, "waiting_for_user", `the gate asked the user: ${JSON.stringify(view.pendingQuestion)}`);
    if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        (prompts[step] ??= []).push(work.prompt);
        if (step === "consistency") checks += 1;
        factory.submit(run.runId, work.nodePath, replyFor(work.nodePath, checks, passOnCheck), { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const done = factory.get(run.runId);
  const started = (step: string) => done.events.filter((e: any) => e.type === "node_started" && e.node === `${GATE}/${step}`).length;
  return { done, prompts, started };
}

test("a consistency gate that still fails after three corrections records the mismatch as a GAP item and asks the user nothing", async () => {
  const { done, prompts, started } = await driveGate(Number.POSITIVE_INFINITY);
  assert.equal(done.status, "done");
  assert.equal(done.events.filter((e: any) => e.type === "needs_input").length, 0, "no question at the gate");
  assert.equal(started("consistency"), 4, "the check of the third correction is the fourth check");
  assert.equal(started("fix"), 3, "three corrections");
  assert.equal(started("record-gap"), 1);
  const [record] = prompts["record-gap"] ?? [];
  assert.match(record ?? "", /`BLOCKING` open item `GAP-<n>`/);
  assert.match(record ?? "", /implementation\.md open item cites the wrong ordered action/, "the GAP item carries the last mismatches");
  assert.match(record ?? "", /plans\/features\/f1/);
});

test("a consistency gate that passes after the third correction records no GAP item", async () => {
  const { done, started } = await driveGate(4);
  assert.equal(done.status, "done");
  assert.equal(started("fix"), 3);
  assert.equal(started("record-gap"), 0);
});

