import assert from "node:assert/strict";
import test from "node:test";
import { driveWorkflow, fencedJson, stoppedBy, type PlanRun } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { missingEdges } = await import("./edge-coverage.ts");

const json = (body: unknown): string => fencedJson(body, "Reply.");

const RUNS: PlanRun[] = [];
const UNREACHABLE: Record<string, string> = {
  "entry-stop -> END": "entry-stop is a builtin.stop step: it always fails the run, so its edge to END is never taken",
};

const CONTEXT = json({
  feature: { title: "Approval gate", goal: "A gated op waits for the user", criteria: ["A gated op does not run before the answer"] },
  tasks: [{ id: "T1", title: "Approval question", criteria: ["AC1: decline runs no op"] }],
  hierarchy: "- Feature: Approval gate\n  - T1: Approval question",
});
const PASSED = json({ ok: true, featureId: "f-1", featureDir: "plans/features/f-1", feature: "F", tasks: "T1", taskIds: ["T1"], criteria: "AC1", reason: "" });
const FAILED = json({ ok: false, featureId: "", featureDir: "", feature: "", tasks: "", taskIds: [], criteria: "", reason: "no Feature context" });

async function drive(tracker: boolean, gate: string) {
  const reply = ({ step }: { step: string }) => (step === "context" ? CONTEXT : step === "feature" ? gate : undefined);
  return driveWorkflow({ workflow: "olko-plan-entry", goal: "plan entry", input: { project: "/repo", featureId: "f-1", switches: { tracker } }, tempPrefix: "factory-plan-edges-entry-", reply, runs: RUNS });
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
