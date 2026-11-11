import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateWhen, loadWorkflowFile } from "../src/workflow-yaml.ts";

function writeYaml(text: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
  const file = path.join(dir, "flow.yaml");
  fs.writeFileSync(file, text);
  return file;
}

const VALID = `
name: two-steps
version: 1.0.0
entry: first
roles: { worker: low }
nodes:
  - id: first
    kind: script
    op: review.detectLenses
  - id: second
    kind: llm
    role: worker
    agent: olko-review-verifier
    prompt: "Check {{goal}}"
edges:
  - { from: first, to: second }
  - { from: second, to: END }
`;

test("a valid YAML workflow loads with node paths, roles and edges", () => {
  const workflow = loadWorkflowFile(writeYaml(VALID));
  assert.equal(workflow.name, "two-steps");
  assert.deepEqual(workflow.nodes.map((n) => n.path), ["two-steps/first", "two-steps/second"]);
  assert.equal(workflow.roles?.worker, "low");
  assert.equal(workflow.entry, "first");
});

const INVALID: [string, string, RegExp][] = [
  ["unknown operation", VALID.replace("review.detectLenses", "review.nothing"), /unknown operation review\.nothing/],
  ["edge to a missing node", VALID.replace("{ from: second, to: END }", "{ from: second, to: third }"), /edge to unknown node 'third'/],
  ["llm node role without a tier", VALID.replace("roles: { worker: low }", "roles: { other: low }"), /role worker has no tier/],
  ["schema violation", VALID.replace("kind: script", "kind: shell"), /kind/],
  ["broken YAML", "name: [", /YAML/],
];

for (const [label, text, error] of INVALID) {
  test(`a workflow with ${label} is rejected with a clear error`, () => {
    assert.throws(() => loadWorkflowFile(writeYaml(text)), error);
  });
}

const CONDITIONS: [string, Record<string, unknown>, boolean][] = [
  ["merge.findings > 0", { merge: { findings: [{}] } }, true],
  ["merge.findings > 0", { merge: { findings: [] } }, false],
  ["merge.findings == 0", { merge: { findings: [] } }, true],
  ['ask-post.answer == "post"', { "ask-post": { answer: "post" } }, true],
  ['ask-post.answer == "post"', { "ask-post": { answer: "skip" } }, false],
  ['tests.status != "pass"', { tests: { status: "fail" } }, true],
  ["verify.attempts >= 3", { verify: { attempts: 3 } }, true],
];

for (const [when, state, expected] of CONDITIONS) {
  test(`edge condition ${when} on ${JSON.stringify(state)} is ${expected}`, () => {
    assert.equal(evaluateWhen(when, state), expected);
  });
}

test("an edge condition on a missing state path is rejected", () => {
  assert.throws(() => evaluateWhen("merge.findings > 0", {}), /merge\.findings is not set/);
});
