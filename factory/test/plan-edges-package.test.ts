import assert from "node:assert/strict";
import test from "node:test";
import { driveWorkflow, type PlanRun } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { missingEdges } = await import("./edge-coverage.ts");

const PACKAGE = "olko-plan-package";
const PASS = "consistency | pass | 0 | none";
const FAIL = "consistency | fail | 1 | business.md promises an export the Tasks leave out";
const RUNS: PlanRun[] = [];

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
  return driveWorkflow({ workflow: PACKAGE, goal: "plan package", input: { project: "/repo" }, tempPrefix: "factory-plan-edges-package-", reply: (work) => reply(work.step, work.visit, work.agentId), answer: () => "1", runs: RUNS });
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
