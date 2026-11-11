import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateWhen, loadWorkflowFile } from "../src/workflow-yaml.ts";
import { claudeTools, readMarketplaceAgent } from "../src/marketplace-agents.ts";
import { parseComparison, syncOptions } from "../src/ops.ts";

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

test("the comparator result line becomes a classification with versions and action", () => {
  const parsed = parseComparison("Report text\nresult | portable-local-change | 1.0.0 | minor | 1.1.0 | adopt minor\n");
  assert.deepEqual({ ...parsed, report: undefined }, { classification: "portable-local-change", marketplaceVersion: "1.0.0", bump: "minor", nextVersion: "1.1.0", action: "adopt minor", report: undefined });
  assert.equal(parseComparison("`result | identical | 2.0.0 | none | none | none`").classification, "identical");
});

test("a comparator report without a result line or with an unknown classification is rejected", () => {
  assert.throws(() => parseComparison("no result here"), /no 'result \|' line/);
  assert.throws(() => parseComparison("result | maybe | 1.0.0 | none | none | leave"), /unknown classification 'maybe'/);
});

test("decision options follow the classification as the source agent lists them", () => {
  assert.deepEqual(syncOptions("local-only"), ["create", "reject", "leave"]);
  assert.deepEqual(syncOptions("adapter-candidate"), ["move-to-adapter", "adopt-patch", "adopt-minor", "adopt-major", "revert-local", "leave"]);
  assert.deepEqual(syncOptions("conflict"), ["adopt-patch", "adopt-minor", "adopt-major", "revert-local", "leave"]);
});

test("node tools map to Claude Code tools; everything else is disallowed", () => {
  assert.deepEqual(claudeTools(["read"]).allowed, ["Read", "Grep", "Glob", "Skill"]);
  const write = claudeTools(["read", "edit"]);
  assert.ok(write.allowed.includes("Edit") && write.disallowed.includes("Bash"));
  assert.ok(claudeTools(["read", "bash"]).allowed.includes("Bash"));
});

test("a marketplace skill becomes agent instructions that name the skill directory", () => {
  const skill = readMarketplaceAgent("olko-adapt-to-marketplace");
  assert.ok(skill.skillDir && fs.existsSync(path.join(skill.skillDir, "SKILL.md")));
  assert.match(skill.prompt, /^Follow the skill olko-adapt-to-marketplace/);
  assert.equal(readMarketplaceAgent("olko-review-verifier").skillDir, undefined);
});

test("a YAML node with skill, tools, dirs and a question with allowedFrom loads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
  const file = path.join(dir, "flow.yaml");
  fs.writeFileSync(file, `
name: skill-node
version: 1.0.0
entry: adapt
roles: { adapter: medium }
nodes:
  - id: adapt
    kind: llm
    role: adapter
    skill: olko-adapt-to-marketplace
    tools: [read, edit]
    dirs: ["{{input.marketplace}}"]
    prompt: "go"
  - id: ask
    kind: interrupt
    question: { id: q-pick, text: "Pick", allowedFrom: state.adapt.options }
edges:
  - { from: adapt, to: ask }
  - { from: ask, to: END }
`);
  const workflow = loadWorkflowFile(file);
  const adapt = workflow.nodes[0]!;
  assert.equal(adapt.agent, "olko-adapt-to-marketplace");
  assert.deepEqual(adapt.tools, ["read", "edit"]);
  assert.deepEqual(adapt.dirs?.({ goal: "", input: { marketplace: "C:/m" }, state: {}, agent: { id: "adapt" } }), ["C:/m"]);
  assert.equal(workflow.nodes[1]!.question?.allowedFrom, "state.adapt.options");
});

test("the marketplace skill sync workflow loads from YAML", () => {
  const workflow = loadWorkflowFile(path.join(import.meta.dirname, "..", "workflows", "olko-marketplace-skill-sync.yaml"));
  assert.equal(workflow.name, "olko-marketplace-skill-sync");
  assert.equal(workflow.nodes.find((n) => n.id === "adapt")?.agent, "olko-adapt-to-marketplace");
  assert.deepEqual(workflow.nodes.find((n) => n.id === "compare")?.tools, undefined);
});
