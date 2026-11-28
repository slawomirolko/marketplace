import assert from "node:assert/strict";
import test from "node:test";
import { driveWorkflow, type PlanRun } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { missingEdges, SCENARIOS_FILTERED } = await import("./edge-coverage.ts");

const GATE = "olko-plan-gate";
const PASS = "consistency | pass | 0 | none";
const FAIL = "consistency | fail | 1 | stack.md misses the queue dependency";
const RUNS: PlanRun[] = [];

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
  return driveWorkflow({ workflow: GATE, goal: "plan gate", input: { project: "/repo", featureDir: "plans/features/f1" }, tempPrefix: "factory-plan-edges-gate-", reply: (work) => reply(work.step, work.visit), answer: () => "1", runs: RUNS });
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

test("the scenarios above take every edge of the gate workflow", { skip: SCENARIOS_FILTERED }, () => {
  assert.deepEqual(missingEdges(GATE, RUNS), []);
});
