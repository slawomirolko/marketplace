import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { marketplaceDir } from "../src/marketplace-agents.ts";
import { readLock, staleWorkflows } from "../src/sources-lock.ts";
import { loadWorkflowSpecs } from "../src/workflow-yaml.ts";
import type { WorkflowSpec, WorkflowSpecNode } from "../src/types.ts";

const specs = new Map(loadWorkflowSpecs(path.join(import.meta.dirname, "..", "workflows")).map((s) => [s.name, s]));
const ADVISOR = "olko-test-coverage-advisor";
const CHANGED = ["olko-skill-sync-compare", "olko-skill-sync-decide", "olko-marketplace-skill-sync", "olko-skill-sync-apply", "olko-skill-optimizer-propose", "olko-skill-optimizer-apply"];

function spec(name: string): WorkflowSpec {
  const found = specs.get(name);
  assert.ok(found, `workflow ${name} exists`);
  return found;
}

function node(workflow: WorkflowSpec, id: string): WorkflowSpecNode {
  const found = workflow.nodes.find((n) => n.id === id);
  assert.ok(found, `${workflow.name} has node ${id}`);
  return found;
}

function edges(workflow: WorkflowSpec, from: string, to: string) {
  return workflow.edges.filter((e) => e.from === from && e.to === to);
}

test("sync compare runs the advisor per artifact after the comparator", () => {
  const compare = spec("olko-skill-sync-compare");
  const tests = node(compare, "tests");
  assert.equal(tests.kind, "llm");
  assert.equal(tests.agent, ADVISOR);
  assert.equal(tests.agentsFrom, "state.discover.discover.compare");
  assert.deepEqual(tests.parse, { json: ["artifact?", "suggestions?", "covered?", "notApplicable?"] });
  assert.match(tests.prompt ?? "", /suggest/);
  assert.match(tests.prompt ?? "", /testsRoot: \{\{state\.resolve-path\.resolve-path\.path\}\}/);
  assert.equal(edges(compare, "compare", "tests").length, 1);
  assert.equal(edges(compare, "tests", "rows").length, 1);
  assert.equal(edges(compare, "compare", "rows").length, 0);
});

test("sync rows show test gap counts", () => {
  const rows = node(spec("olko-skill-sync-compare"), "rows");
  assert.match(rows.prompt ?? "", /state\.tests/);
  assert.match(rows.prompt ?? "", /"line": "[^"]*tests <high>\/<medium>\/<low>/);
});

test("sync decide asks once for accepted test ids", () => {
  const decide = spec("olko-skill-sync-decide");
  const ask = node(decide, "decide-tests");
  assert.equal(ask.kind, "interrupt");
  assert.equal(ask.question?.id, "q-tests");
  assert.equal(ask.question?.allowed, undefined);
  assert.equal(ask.question?.allowedFrom, undefined);
  assert.match(ask.question?.text ?? "", /none/);
  assert.deepEqual(edges(decide, "decide-next", "decide-tests").map((e) => e.when), ["decide-next.done == true"]);
  assert.equal(edges(decide, "decide-next", "END").length, 0, "all decided goes to the test question, not straight to the end");
  assert.deepEqual(edges(decide, "decide-tests", "END").map((e) => e.when), [undefined]);
});

test("sync plan collects accepted test ids", () => {
  const plan = node(spec("olko-marketplace-skill-sync"), "plan");
  assert.ok((plan.parse as { json: string[] }).json.includes("acceptedTests"));
  assert.match(plan.prompt ?? "", /q-tests/);
  assert.match(plan.prompt ?? "", /\{\{state\.decide-tests\.answer\}\}/);
  assert.match(plan.prompt ?? "", /"acceptedTests": \[\{[^\]]*"name": [^\]]*"ids": \[/);
});

test("sync runs advisor apply after the artifact changes and before publish", () => {
  const sync = spec("olko-marketplace-skill-sync");
  const apply = node(sync, "tests-apply");
  assert.equal(apply.agent, ADVISOR);
  assert.equal(apply.agentsFrom, "state.plan.plan.acceptedTests");
  assert.deepEqual(apply.tools, ["read", "edit", "bash"]);
  assert.match(apply.prompt ?? "", /apply/);
  // A group exit cannot carry a condition when the group's own last edge has one, so a pass gate routes after apply-phase.
  assert.equal(node(sync, "tests-gate").op, "builtin.pass");
  assert.deepEqual(edges(sync, "apply-phase", "tests-gate").map((e) => e.when), [undefined]);
  assert.equal(edges(sync, "apply-phase", "publish-phase").length, 0);
  assert.deepEqual(edges(sync, "tests-gate", "tests-apply").map((e) => e.when), ["plan.plan.acceptedTests > 0"]);
  assert.deepEqual(edges(sync, "tests-gate", "publish-phase").map((e) => e.when), [undefined]);
  const fromPlan = sync.edges.filter((e) => e.from === "plan").map((e) => [e.to, e.when]);
  assert.deepEqual(fromPlan, [
    ["apply-phase", "plan.plan.accepted > 0"],
    ["tests-apply", "plan.plan.acceptedTests > 0"],
    ["report", undefined],
  ]);
  assert.deepEqual(edges(sync, "tests-apply", "publish-phase").map((e) => e.when), [undefined], "the advisor never blocks: publish follows whatever it reports");
});

test("optimizer propose adds advice to the draft, apply runs advisor apply before learn", () => {
  const propose = spec("olko-skill-optimizer-propose");
  const advise = node(propose, "advise");
  assert.equal(advise.agent, ADVISOR);
  assert.match(advise.prompt ?? "", /Mode: suggest/);
  assert.deepEqual(advise.parse, { json: ["artifact?", "suggestions?", "covered?", "notApplicable?"] });
  assert.equal(edges(propose, "wording", "advise").length, 1);
  assert.equal(edges(propose, "advise", "draft").length, 1);
  assert.equal(edges(propose, "wording", "draft").length, 0);
  // A json parse stores an object; its raw reply is in `.text`, so the draft reads `state.advise.advise.text` (a bare object renders as [object Object]).
  assert.match(node(propose, "draft").prompt ?? "", /\{\{state\.advise\.advise\.text\}\}/);

  const applyFlow = spec("olko-skill-optimizer-apply");
  const apply = node(applyFlow, "tests-apply");
  assert.equal(apply.agent, ADVISOR);
  assert.match(apply.prompt ?? "", /Mode: apply/);
  assert.match(apply.prompt ?? "", /every suggestion id/);
  assert.match(apply.prompt ?? "", /\{\{state\.draft\.draft\}\}/);
  assert.deepEqual(edges(applyFlow, "apply", "tests-apply").map((e) => e.when), ["advise.advise.suggestions > 0"]);
  assert.deepEqual(edges(applyFlow, "apply", "repo-tests").map((e) => e.when), [undefined], "no suggestions: skip the advisor");
  assert.deepEqual(edges(applyFlow, "tests-apply", "repo-tests").map((e) => e.when), [undefined]);
  assert.deepEqual(edges(applyFlow, "repo-tests", "learn").map((e) => e.when), [undefined]);
  assert.equal(edges(applyFlow, "apply", "learn").length, 0);
  assert.doesNotMatch(node(applyFlow, "apply").prompt ?? "", /Run the repository tests when they exist/, "repository tests run after the advisor writes its tests");
});

test("workflow lock is current for every changed workflow", () => {
  const lock = readLock();
  for (const name of CHANGED) assert.ok(lock[name], `${name} has a lock entry`);
  const stale = staleWorkflows(lock, marketplaceDir()).filter((s) => CHANGED.includes(s.workflow));
  assert.deepEqual(stale, []);
});
