import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
fs.writeFileSync(path.join(dir, "child.yaml"), `
name: child
version: 1.0.0
entry: ask
nodes:
  - id: ask
    kind: interrupt
    question: { id: q-pick, text: "Pick for {{input.pick}}", allowed: [a, b] }
  - id: done
    kind: script
    op: builtin.pass
edges:
  - { from: ask, to: done }
  - { from: done, to: END }
`);
fs.writeFileSync(path.join(dir, "parent.yaml"), `
name: parent
version: 1.0.0
entry: items
nodes:
  - { id: items, kind: script, op: builtin.values, with: { values: [x, y] } }
  - { id: next, kind: script, op: list.next, maxVisits: 5, with: { over: items.values } }
  - { id: review, kind: call, workflow: child, maxVisits: 5, input: { pick: "{{state.next.item}}" } }
edges:
  - { from: items, to: next }
  - { from: next, to: review, when: "next.done == false" }
  - { from: next, to: END, when: "next.done == true" }
  - { from: review, to: next }
`);
process.env.FACTORY_WORKFLOWS_DIR = dir;

async function until(factory: any, runId: string, status: string) {
  for (let i = 0; i < 200; i++) {
    const run = factory.get(runId);
    if (run.status === status) return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`run did not reach ${status}: ${factory.get(runId).status}`);
}

test("a call runs another workflow once per loop item with its own input, state and question ids", async () => {
  process.env.FACTORY_TURN_DELAY_MS = "0";
  const { Factory } = await import("../src/engine.ts");
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-call-")), { backend: "delegate" });
  const { run } = factory.start("call twice", undefined, { workflow: "parent" });
  factory.confirm(run.runId);
  let current = await until(factory, run.runId, "waiting_for_user");
  assert.equal(current.pendingQuestion.id, "review#1:q-pick");
  assert.equal(current.pendingQuestion.text, "Pick for x");
  factory.answer(run.runId, "review#1:q-pick", "a");
  current = await until(factory, run.runId, "waiting_for_user");
  assert.equal(current.pendingQuestion.id, "review#2:q-pick");
  assert.equal(current.pendingQuestion.text, "Pick for y");
  assert.equal(current.state.review.ask, undefined, "a new call starts with empty state");
  factory.answer(run.runId, "review#2:q-pick", "b");
  current = await until(factory, run.runId, "done");
  assert.deepEqual(current.state.review.ask, { answer: "b" });
  assert.equal(current.state.next.done, true);
});
