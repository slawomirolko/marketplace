import assert from "node:assert/strict";
import test from "node:test";
import { driveWorkflow, type PlanRun } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { missingEdges, SCENARIOS_FILTERED } = await import("./edge-coverage.ts");

const RUNS: PlanRun[] = [];
const REPLIES: Record<string, string> = {
  triage: "no tracker change",
  "knowledge-final": "Update notes/approval-gate.md for the gated op mechanism.",
  domain: "domain changes written",
  memory: "memory updated",
  open: "editor | opened | code -n plans/features/f-1",
  report: "Completion report: Ready for implementation: yes.",
};

async function drive(switches: { tracker: boolean; editor: boolean }) {
  return driveWorkflow({ workflow: "olko-plan-finalize", goal: "plan finalize", input: { project: "/repo", switches }, tempPrefix: "factory-plan-edges-finalize-", reply: ({ step }) => REPLIES[step], runs: RUNS });
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

test("the scenarios above take every edge of the finalize workflow", { skip: SCENARIOS_FILTERED }, () => {
  assert.deepEqual(missingEdges("olko-plan-finalize", RUNS), []);
});
