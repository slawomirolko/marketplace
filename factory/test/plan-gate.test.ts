import assert from "node:assert/strict";
import test from "node:test";
import { driveWorkflow } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";

const GATE = "olko-plan-gate";

function replyFor(nodePath: string, checks: number, passOnCheck: number): string {
  const step = nodePath.split("/").pop();
  if (step === "stack") return "stack | none";
  if (step === "consistency") return checks === passOnCheck ? "consistency | pass | 0 | none" : "consistency | fail | 1 | implementation.md open item cites the wrong ordered action";
  if (step === "fix") return "fixed | implementation.md";
  if (step === "record-gap") return "recorded | GAP-1";
  throw new Error(`unexpected step ${nodePath}`);
}

async function driveGate(passOnCheck: number) {
  let checks = 0;
  const reply = ({ nodePath, step }: { nodePath: string; step: string }) => {
    if (step === "consistency") {
      checks += 1;
    }
    return replyFor(nodePath, checks, passOnCheck);
  };
  const { done, prompts } = await driveWorkflow({ workflow: GATE, goal: "check the plan package", input: { project: "/repo", featureDir: "plans/features/f1" }, tempPrefix: "factory-plan-gate-", reply });
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

