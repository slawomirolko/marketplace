import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");
const { missingEdges } = await import("./edge-coverage.ts");

const PACKAGE = "olko-plan-package";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const PASS = "consistency | pass | 0 | none";
const FAIL = "consistency | fail | 1 | business.md promises an export the Tasks leave out";
const RUNS: ReturnType<InstanceType<typeof Factory>["get"]>[] = [];

/** Replies like a package run whose gate check passes on check `passOnCheck` (1-based). */
function packageReply(passOnCheck: number) {
  return (step: string, visit: number, agentId?: string): string | undefined => {
    if (step === "investigate") return `${agentId} evidence: src/gate.ts:12`;
    if (step === "business") return "business.md written";
    if (step === "merge") return "implementation.md written";
    if (step === "stack") return "stack | none";
    if (step === "consistency") return visit === passOnCheck ? PASS : FAIL;
    if (step === "fix") return "fixed | business.md";
    if (step === "record-gap") return "recorded | GAP-1";
    return undefined;
  };
}

async function drive(reply: (step: string, visit: number, agentId?: string) => string | undefined) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-edges-package-")), { backend: "delegate" });
  const { run } = factory.start("plan package", undefined, { workflow: PACKAGE, input: { project: "/repo" } });
  factory.confirm(run.runId);
  const prompts: Record<string, string[]> = {};
  const agents: Record<string, string[]> = {};
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
        (agents[step] ??= []).push(String(work.agentId));
        const output = reply(step, visit, work.agentId);
        if (output === undefined) throw new Error(`unexpected step ${step}`);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const done = factory.get(run.runId);
  RUNS.push(done);
  return { done, prompts, agents, asked };
}

test("the five investigators feed the business writer and the plan editor, and a consistent package passes the gate at once", async () => {
  const { done, prompts, agents, asked } = await drive(packageReply(1));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual([...agents["investigate"]!].sort(), ["flow", "knowledge", "readiness", "runtime", "test"]);
  assert.match(prompts["business"]![0]!, /Knowledge base context: knowledge evidence: src\/gate\.ts:12/);
  assert.match(prompts["merge"]![0]!, /Flow evidence: flow evidence[\s\S]*Runtime evidence: runtime evidence[\s\S]*Test evidence: test evidence[\s\S]*Readiness evidence: readiness evidence/);
  assert.equal(prompts["fix"], undefined);
  assert.deepEqual(asked, []);
});

test("a package that stays inconsistent after three corrections ends with a GAP item instead of a question", async () => {
  const { done, prompts, asked } = await drive(packageReply(Number.POSITIVE_INFINITY));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["fix"]!.length, 3);
  assert.equal(prompts["record-gap"]!.length, 1);
  assert.match(prompts["record-gap"]![0]!, /business\.md promises an export the Tasks leave out/);
  assert.equal(prompts["business"]!.length, 1, "the corrections do not rewrite the business document");
  assert.deepEqual(asked, []);
});

test("the scenarios above take every edge of the package workflow", () => {
  assert.deepEqual(missingEdges(PACKAGE, RUNS), []);
});
