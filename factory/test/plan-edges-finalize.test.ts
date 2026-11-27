import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");
const { missingEdges } = await import("./edge-coverage.ts");

const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const RUNS: ReturnType<InstanceType<typeof Factory>["get"]>[] = [];
const REPLIES: Record<string, string> = {
  triage: "no tracker change",
  "knowledge-final": "Update notes/approval-gate.md for the gated op mechanism.",
  domain: "domain changes written",
  memory: "memory updated",
  open: "editor | opened | code -n plans/features/f-1",
  report: "Completion report: Ready for implementation: yes.",
};

async function drive(switches: { tracker: boolean; editor: boolean }) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-edges-finalize-")), { backend: "delegate" });
  const { run } = factory.start("plan finalize", undefined, { workflow: "olko-plan-finalize", input: { project: "/repo", switches } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  const order: string[] = [];
  for (let i = 0; i < 500; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    assert.notEqual(view.status, "waiting_for_user", `finalize asked the user: ${JSON.stringify(view.pendingQuestion)}`);
    if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        (prompts[step] ??= []).push(work.prompt);
        order.push(step);
        const output = REPLIES[step];
        if (output === undefined) throw new Error(`unexpected step ${step}`);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const done = factory.get(run.runId);
  RUNS.push(done);
  return { done, prompts, order };
}

test("with the tracker and editor switches on, the triage runs first and the plan folder opens before the completion report", async () => {
  const { done, order } = await drive({ tracker: true, editor: true });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(order, ["triage", "knowledge-final", "domain", "memory", "open", "report"]);
});

test("with both switches off, neither the triage nor the editor runs and the report still ends the run", async () => {
  const { done, order } = await drive({ tracker: false, editor: false });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(order, ["knowledge-final", "domain", "memory", "report"]);
});

test("the Domain changes step gets the write-free knowledge recommendation", async () => {
  const { done, prompts } = await drive({ tracker: false, editor: true });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.match(prompts["domain"]![0]!, /Update notes\/approval-gate\.md for the gated op mechanism\./);
  assert.match(prompts["knowledge-final"]![0]!, /Do not change the vault/);
});

test("the scenarios above take every edge of the finalize workflow", () => {
  assert.deepEqual(missingEdges("olko-plan-finalize", RUNS), []);
});
