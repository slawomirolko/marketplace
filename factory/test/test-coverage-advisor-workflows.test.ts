import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { marketplaceDir } from "../src/marketplace-agents.ts";
import { readLock, staleWorkflows } from "../src/sources-lock.ts";
import { loadWorkflowSpecs } from "../src/workflow-yaml.ts";
import type { WorkflowSpec, WorkflowSpecNode } from "../src/types.ts";

const specs = new Map(loadWorkflowSpecs(path.join(import.meta.dirname, "..", "workflows")).map((s) => [s.name, s]));
const ADVISOR = "olko-test-coverage-advisor";
const CHANGED = ["olko-skill-sync-compare", "olko-skill-sync-decide", "olko-marketplace-skill-sync", "olko-skill-sync-apply", "olko-skill-sync-publish", "olko-skill-optimizer-propose", "olko-skill-optimizer-apply"];
const ADVISOR_NODES: [string, string][] = [["olko-skill-sync-compare", "tests"], ["olko-marketplace-skill-sync", "tests-apply"], ["olko-skill-optimizer-propose", "advise"], ["olko-skill-optimizer-apply", "tests-apply"]];
/** The optimizer's testsRoot: the person's answer when asked, else the resolved marketplace checkout. */
const TESTS_ROOT = "{{#state.ask-tests-root.answer}}{{state.ask-tests-root.answer}}{{/state.ask-tests-root.answer}}{{^state.ask-tests-root.answer}}{{state.tests-root.tests-root}}{{/state.ask-tests-root.answer}}";

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
  assert.equal(tests.parse, "text", "a malformed advisor reply never fails the run");
  assert.match(tests.prompt ?? "", /suggest/);
  assert.match(tests.prompt ?? "", /revert-local[^.]*dropped at plan time/);
  assert.match(tests.prompt ?? "", /testsRoot: \{\{state\.resolve-path\.resolve-path\.path\}\}/);
  assert.equal(edges(compare, "compare", "tests").length, 1);
  assert.equal(edges(compare, "tests", "rows").length, 1);
  assert.equal(edges(compare, "compare", "rows").length, 0);
});

test("sync rows show test gap counts read from the advisor text", () => {
  const rows = node(spec("olko-skill-sync-compare"), "rows");
  assert.match(rows.prompt ?? "", /\{\{#each\.state\.tests\}\}[\s\S]*\{\{value\}\}[\s\S]*\{\{\/each\.state\.tests\}\}/);
  assert.doesNotMatch(rows.prompt ?? "", /value\.(suggestions|covered)/);
  assert.match(rows.prompt ?? "", /"line": "[^"]*tests <high>\/<medium>\/<low>/);
});

test("every advisor node parses text, and no template reads advisor JSON fields", () => {
  for (const [workflow, id] of ADVISOR_NODES) assert.equal(node(spec(workflow), id).parse, "text", `${workflow} ${id}`);
  for (const name of CHANGED) {
    for (const n of spec(name).nodes) {
      const text = [n.prompt ?? "", n.question?.text ?? "", ...(n.dirs ?? [])].join("\n");
      assert.doesNotMatch(text, /(advise\.advise|tests-apply\.tests-apply|value)\.(text|suggestions|covered|written|results)\b/, `${name} ${n.id}`);
      assert.doesNotMatch(text, /input\.testsRoot/, `${name} ${n.id}`);
    }
  }
});

test("sync decide asks once for accepted test ids, composed by grill-with-docs", () => {
  const decide = spec("olko-skill-sync-decide");
  const grill = node(decide, "tests-grill");
  assert.equal(grill.kind, "llm");
  assert.equal(grill.skill, "grill-with-docs");
  assert.match(grill.prompt ?? "", /none/);
  assert.match(grill.prompt ?? "", /\{\{state\.rows\.rows\.tests\}\}/);
  const ask = node(decide, "decide-tests");
  assert.equal(ask.kind, "interrupt");
  assert.equal(ask.askedBy, "tests-grill");
  assert.equal(ask.question?.id, "q-tests");
  assert.equal(ask.question?.text, "{{state.tests-grill.tests-grill}}");
  assert.equal(ask.question?.allowed, undefined);
  assert.equal(ask.question?.allowedFrom, undefined);
  assert.deepEqual(edges(decide, "decide-next", "tests-grill").map((e) => e.when), ["decide-next.done == true && rows.rows.testIds > 0"]);
  assert.deepEqual(edges(decide, "decide-next", "END").map((e) => e.when), ["decide-next.done == true"], "no suggestion ids: no test question");
  const order = decide.edges.filter((e) => e.from === "decide-next").map((e) => e.to);
  assert.ok(order.indexOf("tests-grill") < order.indexOf("END"), "the test question edge is tried first");
  assert.deepEqual(edges(decide, "tests-grill", "grill-blocked-decide").map((e) => e.when), ['tests-grill.tests-grill == "blocker | grill-with-docs cannot be loaded"']);
  assert.deepEqual(edges(decide, "tests-grill", "decide-tests").map((e) => e.when), [undefined]);
  assert.deepEqual(edges(decide, "decide-tests", "END").map((e) => e.when), [undefined]);
});

test("sync plan collects accepted test ids", () => {
  const plan = node(spec("olko-marketplace-skill-sync"), "plan");
  assert.ok((plan.parse as { json: string[] }).json.includes("acceptedTests"));
  assert.match(plan.prompt ?? "", /q-tests/);
  assert.match(plan.prompt ?? "", /\{\{state\.decide-tests\.answer\}\}/);
  assert.match(plan.prompt ?? "", /"acceptedTests": \[\{[^\]]*"name": [^\]]*"ids": \[/);
});

test("sync plan keeps test ids only for artifacts in the marketplace after apply", () => {
  const plan = node(spec("olko-marketplace-skill-sync"), "plan");
  assert.ok((plan.parse as { json: string[] }).json.includes("droppedTests?"));
  const prompt = (plan.prompt ?? "").replace(/\s+/g, " ");
  assert.match(prompt, /exists in the marketplace after apply/);
  assert.match(prompt, /Drop it[^.]*`revert-local`/);
  assert.match(prompt, /marketplace `none`[^.]*`create`/);
  assert.match(prompt, /"droppedTests": \[\{"id": [^\]]*"reason": /);
});

test("sync runs advisor apply after the artifact changes and before publish", () => {
  const sync = spec("olko-marketplace-skill-sync");
  const apply = node(sync, "tests-apply");
  assert.equal(apply.agent, ADVISOR);
  assert.equal(apply.agentsFrom, "state.plan.plan.acceptedTests");
  assert.deepEqual(apply.tools, ["read", "edit", "bash"]);
  assert.match(apply.prompt ?? "", /apply/);
  assert.match(apply.prompt ?? "", /\{\{#each\.state\.tests\}\}[\s\S]*\{\{value\}\}/);
  /** A group exit cannot carry a condition when the group's own last edge has one, so a pass gate routes after apply-phase. */
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

test("optimizer resolves testsRoot before advise, or asks", () => {
  const propose = spec("olko-skill-optimizer-propose");
  const resolve = node(propose, "tests-root");
  assert.equal(resolve.kind, "llm");
  assert.equal(resolve.parse, "text", "a malformed reply never fails the run");
  assert.match(resolve.prompt ?? "", /Reply with only the absolute path, or exactly `none`/);
  assert.doesNotMatch(resolve.prompt ?? "", /```json|null/, "no JSON shape a model could copy as the string \"null\"");
  const order = (resolve.prompt ?? "").replace(/\s+/g, " ");
  const at = ["{{input.marketplace}}", "MARKETPLACE_PATH", ".opencode/marketplace-path.local.json"].map((word) => order.indexOf(word));
  assert.ok(at.every((i, n) => i >= 0 && (n === 0 || i > (at[n - 1] ?? -1))), "input, then MARKETPLACE_PATH, then the project adapter");
  const ask = node(propose, "ask-tests-root");
  assert.equal(ask.kind, "interrupt");
  assert.equal(ask.question?.allowed, undefined, "free text: also a project root");
  assert.match(ask.question?.text ?? "", /project root/);
  assert.equal(edges(propose, "wording", "tests-root").length, 1);
  assert.deepEqual(edges(propose, "tests-root", "ask-tests-root").map((e) => e.when), ['tests-root.tests-root == "none"']);
  assert.deepEqual(edges(propose, "tests-root", "advise").map((e) => e.when), [undefined]);
  assert.deepEqual(edges(propose, "ask-tests-root", "advise").map((e) => e.when), [undefined]);
  const advise = node(propose, "advise");
  assert.ok((advise.prompt ?? "").includes(`testsRoot: ${TESTS_ROOT}`));
  assert.deepEqual(advise.dirs?.slice(1), [TESTS_ROOT]);
  const apply = node(spec("olko-skill-optimizer-apply"), "tests-apply");
  assert.ok((apply.prompt ?? "").includes(`testsRoot: ${TESTS_ROOT}`));
  assert.deepEqual(apply.dirs?.slice(1), [TESTS_ROOT]);
});

test("optimizer propose adds advice to the draft, apply runs advisor apply before learn", () => {
  const propose = spec("olko-skill-optimizer-propose");
  const advise = node(propose, "advise");
  assert.equal(advise.agent, ADVISOR);
  assert.match(advise.prompt ?? "", /Mode: suggest/);
  assert.equal(edges(propose, "wording", "advise").length, 0);
  assert.equal(edges(propose, "advise", "draft").length, 1);
  assert.equal(edges(propose, "wording", "draft").length, 0);
  /** A text parse stores the reply as a string, so the draft reads `state.advise.advise` itself. */
  assert.match(node(propose, "draft").prompt ?? "", /\{\{state\.advise\.advise\}\}/);

  const applyFlow = spec("olko-skill-optimizer-apply");
  const apply = node(applyFlow, "tests-apply");
  assert.equal(apply.agent, ADVISOR);
  assert.match(apply.prompt ?? "", /Mode: apply/);
  assert.match(apply.prompt ?? "", /every suggestion id/);
  assert.match(apply.prompt ?? "", /\{\{state\.draft\.draft\}\}/);
  assert.match(apply.prompt ?? "", /no suggestion ids[^.]*write nothing/i, "no ids: the advisor does nothing");
  /** No JSON-parsed step reports the suggestion count, so tests-apply always runs and does nothing when there are no ids. */
  assert.deepEqual(edges(applyFlow, "apply", "tests-apply").map((e) => e.when), [undefined]);
  assert.equal(edges(applyFlow, "apply", "repo-tests").length, 0);
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
