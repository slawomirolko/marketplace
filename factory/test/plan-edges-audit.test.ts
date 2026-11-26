import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");
const { missingEdges } = await import("./edge-coverage.ts");

const AUDIT = "olko-plan-audit";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const FENCE = "`".repeat(3);
const PASS = "consistency | pass | 0 | none";
const FAIL = "consistency | fail | 1 | implementation.md names a sealed class the Task leaves open";
const FINDING = "dotnet | sealed leaf types | src/Gate.cs:7 | seal the new handler";
const DOTNET = { id: "dotnet", agentName: "olko-dotnet-auditor" };
const REACT = { id: "react", agentName: "olko-react-auditor" };
const RUNS: ReturnType<InstanceType<typeof Factory>["get"]>[] = [];

function block(body: unknown): string {
  return `Done.\n${FENCE}json\n${JSON.stringify(body)}\n${FENCE}`;
}

/** Replies like an audit with the given auditors and findings whose gate check passes on check `passOnCheck` (1-based). */
function auditReply(chosen: object[], findings: string[], passOnCheck = 1) {
  return (step: string, visit: number, agentId?: string): string | undefined => {
    if (step === "auditors") return block({ agents: chosen, skipped: "the others: technology not in the implementation scope" });
    if (step === "audit") return findings.length ? `${agentId}: ${findings.join("; ")}` : `${agentId}: nothing found`;
    if (step === "audit-merge") return block({ findings });
    if (step === "fold-audit") return "folded";
    if (step === "stack") return "stack | none";
    if (step === "consistency") return visit === passOnCheck ? PASS : FAIL;
    if (step === "fix") return "fixed | implementation.md";
    if (step === "record-gap") return "recorded | GAP-1";
    return undefined;
  };
}

async function drive(reply: (step: string, visit: number, agentId?: string) => string | undefined) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-edges-audit-")), { backend: "delegate" });
  const { run } = factory.start("plan audit", undefined, { workflow: AUDIT, input: { project: "/repo" } });
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

test("a plan with no technology an auditor covers skips the audits and the gate", async () => {
  const { done, prompts } = await drive(auditReply([], []));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["audit"], undefined);
  assert.equal(prompts["stack"], undefined);
});

test("only the chosen auditors run, and an audit without findings changes nothing and skips the gate", async () => {
  const { done, prompts, agents } = await drive(auditReply([DOTNET, REACT], []));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual([...agents["audit"]!].sort(), ["dotnet", "react"]);
  assert.match(prompts["audit-merge"]![0]!, /auditor dotnet:\s+dotnet: nothing found[\s\S]*auditor react:\s+react: nothing found/);
  assert.equal(prompts["fold-audit"], undefined);
  assert.equal(prompts["stack"], undefined);
});

test("auditor findings are folded into the plan and the consistency gate runs once on the result", async () => {
  const { done, prompts, asked } = await drive(auditReply([DOTNET], [FINDING]));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.match(prompts["fold-audit"]![0]!, /- dotnet \| sealed leaf types \| src\/Gate\.cs:7 \| seal the new handler/);
  assert.equal(prompts["consistency"]!.length, 1);
  assert.equal(prompts["fix"], undefined);
  assert.deepEqual(asked, []);
});

test("folded findings that leave the plan inconsistent after three corrections end with a GAP item", async () => {
  const { done, prompts, asked } = await drive(auditReply([DOTNET], [FINDING], Number.POSITIVE_INFINITY));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["fix"]!.length, 3);
  assert.equal(prompts["record-gap"]!.length, 1);
  assert.match(prompts["record-gap"]![0]!, /implementation\.md names a sealed class the Task leaves open/);
  assert.equal(prompts["fold-audit"]!.length, 1, "the corrections do not fold the findings again");
  assert.deepEqual(asked, []);
});

test("the scenarios above take every edge of the audit workflow", () => {
  assert.deepEqual(missingEdges(AUDIT, RUNS), []);
});
