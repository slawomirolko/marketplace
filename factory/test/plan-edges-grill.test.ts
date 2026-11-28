import assert from "node:assert/strict";
import test from "node:test";
import { applied, driveWorkflow, questions, type PlanRun } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { missingEdges, SCENARIOS_FILTERED } = await import("./edge-coverage.ts");

const GRILL = "olko-plan-grill";
const PASS = "consistency | pass | 0 | none";
const FAIL = "consistency | fail | 1 | tracker.md decision D2 is missing from implementation.md";
const RUNS: PlanRun[] = [];

type Reply = (step: string, visit: number, agentId?: string) => string | undefined;

/** Replies for the record, revalidate and gate steps that most scenarios share; `passOnCheck` is the 1-based gate check that passes. */
function common(passOnCheck = 1): Reply {
  return (step, visit) => {
    if (step === "grill-record") return "recorded | batch";
    if (step === "revalidate") return "findings | none | 0 | none";
    if (step === "stack") return "stack | none";
    if (step === "consistency") return visit === passOnCheck ? PASS : FAIL;
    if (step === "fix") return "fixed | implementation.md";
    if (step === "record-gap") return "recorded | GAP-1";
    return undefined;
  };
}

/** Grill batches by visit (the last one repeats), approved unchanged by the reviewer. */
function batches(...sizes: number[]): Reply {
  let batch = "";
  return (step, visit) => {
    if (step === "grill") return (batch = questions(`Round ${visit} question`, sizes[Math.min(visit, sizes.length) - 1]!));
    if (step === "grill-review") return batch;
    return undefined;
  };
}

async function drive(...replies: Reply[]) {
  const reply = (work: { step: string; visit: number; agentId?: string }) => replies.map((each) => each(work.step, work.visit, work.agentId)).find((output) => output !== undefined);
  return driveWorkflow({ workflow: GRILL, goal: "plan grill", input: { project: "/repo" }, tempPrefix: "factory-plan-edges-grill-", reply, answer: () => "1", runs: RUNS });
}

test("a plan with no open question ends the grill without asking the user or running the gate", async () => {
  const { done, prompts, asked } = await drive(batches(0));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, []);
  assert.equal(prompts["grill-review"], undefined);
  assert.equal(prompts["stack"], undefined);
});

test("a batch the question reviewer rejects completely is never put to the user", async () => {
  const { done, prompts, asked } = await drive((step) => (step === "grill" ? questions("Rejected question", 2) : step === "grill-review" ? questions("none", 0) : undefined));
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.match(prompts["grill-review"]![0]!, /Rejected question 1[\s\S]*Rejected question 2/);
  assert.deepEqual(asked, []);
  assert.equal(prompts["grill-record"], undefined);
});

test("an answered batch that changes no claim skips re-validation, passes the gate and starts a new round", async () => {
  const { done, prompts, asked } = await drive(batches(2, 0), (step) => (step === "grill-apply" ? applied([], []) : undefined), common());
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, ["q-plan-grill-1-0", "q-plan-grill-1-1"]);
  assert.match(prompts["grill-record"]![0]!, /Question 1:\s+Round 1 question 1[\s\S]*Question 2:\s+Round 1 question 2/);
  assert.equal(prompts["revalidate"], undefined);
  assert.ok(done.events.some((e: any) => e.type === "node_skipped" && String(e.node).endsWith("/revalidate")));
  assert.equal(prompts["consistency"]!.length, 1);
  assert.equal(prompts["grill"]!.length, 2, "a second round looks for follow-up questions");
});

test("a re-validation finding is folded in, and a gate still failing after three corrections records a GAP item before the next round", async () => {
  const { done, prompts, agents, asked } = await drive(
    batches(1, 0),
    (step, _visit, agentId) => {
      if (step === "grill-apply") return applied(["implementation.md: the gate runs before the operation"], ["runtime"]);
      if (step === "revalidate") return agentId === "runtime" ? "findings | found | 1 | the timeout is read from another setting" : undefined;
      if (step === "fold-reval") return "folded";
      return undefined;
    },
    common(Number.POSITIVE_INFINITY),
  );
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, ["q-plan-grill-1-0"]);
  assert.deepEqual(agents["revalidate"], ["runtime"]);
  assert.match(prompts["fold-reval"]![0]!, /runtime: found \| the timeout is read from another setting/);
  assert.equal(prompts["fix"]!.length, 3);
  assert.equal(prompts["record-gap"]!.length, 1);
  assert.equal(prompts["grill"]!.length, 2, "the grill goes on after the GAP item is recorded");
});

test("after three rounds with questions the grill stops without a fourth batch", async () => {
  const { done, prompts, asked } = await drive(batches(1), (step) => (step === "grill-apply" ? applied([], []) : undefined), common());
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["grill"]!.length, 3);
  assert.deepEqual(asked, ["q-plan-grill-1-0", "q-plan-grill-2-0", "q-plan-grill-3-0"]);
  assert.equal(prompts["grill-record"]!.length, 3);
});

test("the scenarios above take every edge of the grill workflow", { skip: SCENARIOS_FILTERED }, () => {
  assert.deepEqual(missingEdges(GRILL, RUNS), []);
});
