import assert from "node:assert/strict";
import test from "node:test";
import { ENDED, FENCE, driveRun } from "./helpers/plan-driver.ts";
import { tempDir } from "./helpers/temp.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";

type Handler = (prompt: string) => string;

const json = (value: unknown) => `${FENCE}json\n${JSON.stringify(value)}\n${FENCE}`;

async function drive(factory: any, runId: string, agents: Record<string, Handler>, answers: Record<string, string>): Promise<{ run: any; prompts: any; questions: any[] }> {
  const questions: { id: string; text: string }[] = [];
  const { done, prompts } = await driveRun(factory, runId, {
    usage: {},
    reply: ({ nodePath, step, prompt }) => {
      const handler = agents[step];
      if (!handler) {
        throw new Error(`no scripted output for ${nodePath}`);
      }
      return handler(prompt);
    },
    answer: (id, question) => {
      questions.push({ id, text: question.text });
      const key = Object.keys(answers).find((suffix) => id.endsWith(suffix));
      if (!key) {
        throw new Error(`no scripted answer for ${id}: ${question.text}`);
      }
      return answers[key]!;
    },
  });
  if (!ENDED.has(done.status)) {
    throw new Error("the run did not end");
  }
  return { run: done, prompts, questions };
}

async function newFactory() {
  const { Factory } = await import("../src/engine.ts");
  return new Factory(tempDir("factory-adr-"), { backend: "delegate" });
}

const BLOCKED = { topic: "logging.format", adrs: ["ADR-0001", "ADR-0002"], paths: ["src/Api/A.cs"] };
const DIGEST = [{ source: "ADR-0004", topic: "persistence.orm", line: "Use EF Core for data access." }];

test("impl build: the store digest is built once for all chunk files and leads every implementer prompt; a blocked topic asks the user first", async () => {
  const factory = await newFactory();
  const { run } = factory.start("build", undefined, { workflow: "olko-impl-build", input: {} });
  factory.confirm(run.runId);
  const { run: end, prompts, questions } = await drive(
    factory,
    run.runId,
    {
      chunker: () => json({ chunks: [
        { stack: "dotnet", title: "one", files: ["src/Api/A.cs"], brief: "b", agents: [{ id: "dotnet", agentName: "olko-dotnet-implementer" }] },
        { stack: "dotnet", title: "two", files: ["src/Core/B.cs"], brief: "b", agents: [{ id: "dotnet", agentName: "olko-dotnet-implementer" }] },
      ] }),
      "store-context": () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      implement: () => "chunk | done | ok",
      "child-check": () => json({ verdict: "done", violations: [], report: "" }),
    },
    { "q-impl-store": "logging.format=ADR-0002" },
  );
  assert.equal(end.status, "done", end.error);
  assert.equal(prompts["store-context"].length, 1, "one digest per Task, not per chunk");
  assert.match(prompts["store-context"][0], /Paths: src\/Api\/A\.cs src\/Core\/B\.cs/);
  assert.equal(questions.length, 1);
  assert.match(questions[0].text, /logging\.format: ADR-0001 ADR-0002/);
  assert.equal(prompts.implement.length, 2);
  for (const p of prompts.implement) {
    assert.ok(p.trimStart().startsWith("Project store digest for this Task"), "the stable digest comes first");
    assert.match(p, /- ADR-0004 \[persistence\.orm\]: Use EF Core for data access\./);
    assert.match(p, /Binding ADR per overlapping topic, decided by the user for this Task: logging\.format=ADR-0002/);
  }
});

test("impl build: stop on a blocked topic stops before the first chunk; without blocked topics nobody is asked", async () => {
  let factory = await newFactory();
  let started = factory.start("build", undefined, { workflow: "olko-impl-build", input: {} });
  factory.confirm(started.run.runId);
  const chunker = () => json({ chunks: [{ stack: "dotnet", title: "one", files: ["src/A.cs"], brief: "b", agents: [{ id: "dotnet", agentName: "olko-dotnet-implementer" }] }] });
  const stopped = await drive(factory, started.run.runId, { chunker, "store-context": () => json({ noStore: false, digest: [], blocked: [BLOCKED] }) }, { "q-impl-store": "stop" });
  assert.notEqual(stopped.run.status, "done");
  assert.equal(stopped.prompts.implement, undefined, "no chunk ran");
  assert.match(String(stopped.run.error ?? JSON.stringify(stopped.run.events?.slice(-3))), /olko-adr-store-reconcile/);

  factory = await newFactory();
  started = factory.start("build", undefined, { workflow: "olko-impl-build", input: {} });
  factory.confirm(started.run.runId);
  const plain = await drive(
    factory,
    started.run.runId,
    { chunker, "store-context": () => json({ noStore: true, digest: [], blocked: [] }), implement: () => "chunk | done | ok", "child-check": () => json({ verdict: "done", violations: [], report: "" }) },
    {},
  );
  assert.equal(plain.run.status, "done", plain.run.error);
  assert.equal(plain.questions.length, 0);
  assert.ok(!plain.prompts.implement[0].includes("Project store digest"), "no digest header without a store");
});

test("plan rules: an overlapping topic waits for your answer, and your answer and the digest reach the rules check", async () => {
  const factory = await newFactory();
  const { run } = factory.start("plan rules", undefined, { workflow: "olko-review-plan-rules", input: { plan: "docs/plan.md" } });
  factory.confirm(run.runId);
  const { run: end, prompts } = await drive(
    factory,
    run.runId,
    {
      "plan-store-context": () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      "plan-rules": () => "none",
      "plan-rules-merge": () => json({ noStore: false, kept: [], dropped: [], violations: [], decide: [], violationEntries: [] }),
    },
    { "q-plan-store": "logging.format=ADR-0002" },
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["plan-store-context"][0], /read the plan file docs\/plan\.md/);
  assert.match(prompts["plan-rules"][0], /- ADR-0004 \[persistence\.orm\]: Use EF Core for data access\./);
  assert.match(prompts["plan-rules"][0], /Overlapping topic logging\.format \(ADR-0001 ADR-0002 \): the user named the binding ADR: logging\.format=ADR-0002\./);
});

test("store reconcile: batches, then groups found after the front matter, one question each; writes only after an approval; skip and stop write nothing", async () => {
  const project = tempDir("adr-project-");
  const factory = await newFactory();
  const { run } = factory.start("reconcile", undefined, { workflow: "olko-adr-store-reconcile", input: { project } });
  factory.confirm(run.runId);
  const groups = [
    { topic: "logging.format", adrs: ["ADR-0001", "ADR-0002", "ADR-0003"] },
    { topic: "persistence.orm", adrs: ["ADR-0004", "ADR-0007"] },
  ];
  const { run: end, prompts, questions } = await drive(
    factory,
    run.runId,
    {
      worktree: () => json({ path: project, branch: "docs/adr-store-reconcile", base: "main", baseCommit: "abc", resumed: false }),
      inventory: () => json({ noStore: false, batches: [{ ids: ["ADR-0001", "ADR-0002"] }, { ids: ["ADR-0003"] }], groups: [], errors: ["ADR-0009: supersedes ADR-0011, which does not exist"] }),
      fields: (p) => json({ proposals: [{ id: p.includes("ADR-0003") ? "ADR-0003" : "ADR-0001", frontMatter: "---\nstatus: Accepted\ntopic: logging.format\n---", reason: "from the log" }] }),
      "fields-apply": () => json({ written: ["docs/adr/0001-a.md"] }),
      regroup: () => json({ groups }),
      "group-proposal": () => json({ options: [{ number: 1, kind: "merge", reason: "one rule", changes: "new ADR-0012" }, { number: 2, kind: "exception", reason: "r", changes: "c" }, { number: 3, kind: "narrow", reason: "r", changes: "c" }] }),
      "group-apply": () => json({ written: ["docs/adr/0012-logging.md"] }),
      verify: () => json({ valid: false, errors: ["ADR-0004 and ADR-0007: both Accepted"] }),
      report: () => "report",
    },
    { "q-adr-fields-0": "approve", "q-adr-fields-1": "skip", "q-adr-group-0": "1", "q-adr-group-1": "stop" },
  );
  assert.equal(end.status, "done", end.error);
  assert.deepEqual(questions.map((q) => q.id.replace(/^.*(q-adr-[a-z]+-\d)$/, "$1")), ["q-adr-fields-0", "q-adr-fields-1", "q-adr-group-0", "q-adr-group-1"]);
  assert.equal(prompts["fields-apply"].length, 1, "the skipped batch is not written");
  assert.match(prompts["fields-apply"][0], /with this answer: approve/);
  assert.equal(prompts["group-apply"].length, 1, "the stopped group is not written");
  assert.match(prompts["group-apply"][0], /chose option 1 for the group with topic logging\.format/);
  assert.match(questions[2].text, /Option 1 \(merge\): one rule/);
  assert.equal(prompts.regroup.length, 1, "groups are found after the front matter is written");
  assert.match(prompts.report[0], /valid false/);
  assert.match(prompts.report[0], /2 groups of overlapping ADRs/);
});

test("store reconcile: a project without a store stops after the inventory", async () => {
  const project = tempDir("adr-empty-");
  const factory = await newFactory();
  const { run } = factory.start("reconcile", undefined, { workflow: "olko-adr-store-reconcile", input: { project } });
  factory.confirm(run.runId);
  const { run: end, prompts } = await drive(
    factory,
    run.runId,
    {
      worktree: () => json({ path: project, branch: "docs/adr-store-reconcile", base: "main", baseCommit: "abc", resumed: false }),
      inventory: () => json({ noStore: true, batches: [], groups: [], errors: [] }),
    },
    {},
  );
  assert.notEqual(end.status, "done");
  assert.equal(prompts.fields, undefined);
});

test("code review rules: an overlapping topic waits for your answer; the digest and your answer reach the rules check; the merge lists the store entry of each violation", async () => {
  const factory = await newFactory();
  const { run } = factory.start("review rules", undefined, { workflow: "olko-review-rules", input: {} });
  factory.confirm(run.runId);
  const { run: end, prompts } = await drive(
    factory,
    run.runId,
    {
      "rules-store-context": () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      "rules-check": () => "none",
      "rules-merge": () => json({ noStore: false, kept: [], dropped: [], violations: [], decide: [], violationEntries: [] }),
    },
    { "q-rules-store": "logging.format=ADR-0002" },
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["rules-check"][0], /^\s*Project store digest for these paths/);
  assert.match(prompts["rules-check"][0], /- ADR-0004 \[persistence\.orm\]: Use EF Core for data access\./);
  assert.match(prompts["rules-check"][0], /Overlapping topic logging\.format \(ADR-0001 ADR-0002 \): the user named the binding ADR: logging\.format=ADR-0002\./);
  assert.match(prompts["rules-merge"][0], /violationEntries: one item per violation line, in the same order/);
});

test("tests first: the test author gets the digest of the Task plan paths, and an overlapping topic waits for your answer", async () => {
  const factory = await newFactory();
  const { run } = factory.start("tests", undefined, { workflow: "olko-impl-tests-first", input: {} });
  factory.confirm(run.runId);
  const { run: end, prompts } = await drive(
    factory,
    run.runId,
    {
      stacks: () => json({ stacks: ["dotnet"], authors: [{ id: "dotnet", agentName: "olko-test-first-author" }], implementers: [{ id: "dotnet", agentName: "olko-dotnet-implementer" }], runners: [{ id: "dotnet", agentName: "olko-dotnet-test-runner" }] }),
      "tests-store-context": () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      "write-tests": () => "tests | 1 | unclear: none | blocked: none",
      "tests-check": () => json({ verdict: "done", testFiles: ["tests/a.cs"], questions: "" }),
    },
    { "q-tests-store": "logging.format=ADR-0002" },
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["tests-store-context"][0], /read the approved Task plan/);
  assert.match(prompts["write-tests"][0], /^\s*Project store digest for this Task/);
  assert.match(prompts["write-tests"][0], /Overlapping topic logging\.format \(ADR-0001 ADR-0002 \): the user named the binding ADR: logging\.format=ADR-0002\./);
});

test("plan review report: violations per store entry and the reconcile hint for unresolved topics", async () => {
  const factory = await newFactory();
  const { run } = factory.start("plan", undefined, { workflow: "olko-review-plan", input: { plan: "docs/plan.md" } });
  factory.confirm(run.runId);
  const { run: end, prompts } = await drive(
    factory,
    run.runId,
    {
      "plan-lens": () => "none",
      "plan-verify": () => "none",
      "plan-confirm": () => json({ confirmed: [], dropped: [] }),
      "plan-store-context": () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      "plan-rules": () => "none",
      "plan-rules-merge": () => json({ noStore: false, kept: [], dropped: [], violations: ["a", "b", "c"], decide: [], violationEntries: ["project.0001-logging", "project.0004-ef-core", "project.0004-ef-core"] }),
      "plan-verify-violations": () => "none",
      "plan-rules-violations": () => json({ decide: [] }),
      "plan-report": () => json({ kept: [] }),
    },
    { "q-plan-store": "logging.format=ADR-0002" },
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["plan-report"][0], /Store violations per entry: project\.0004-ef-core 2; project\.0001-logging 1; /);
  assert.match(prompts["plan-report"][0], /Overlapping store topics \(the user named the binding ADR for this review\): logging\.format \(ADR-0001 ADR-0002 \)/);
  assert.match(prompts["plan-report"][0], /olko-adr-store-reconcile/);
});

test("implementation report: the store line names the topics decided for this Task only and suggests reconcile; without them it says so", async () => {
  const { loadedWorkflows } = await import("../src/engine.ts");
  const report = loadedWorkflows().get("olko-implementation")!.nodes.find((n: any) => n.id === "report") as any;
  assert.ok(report?.prompt, "the implementation workflow has a report step with a prompt");
  const render = (state: Record<string, unknown>) => report.prompt({ goal: "g", input: {}, state, agent: { id: "report" }, answer: "", answers: {}, steps: 0 }) as string;
  const decided = render({ "store-context": { "store-context": { noStore: false, digest: [], blocked: [BLOCKED] } }, "ask-store": { answer: "logging.format=ADR-0002" } });
  assert.match(decided, /Project store: overlapping ADR topics were decided for this Task only \(logging\.format=ADR-0002\): logging\.format \(ADR-0001 ADR-0002 \);/);
  assert.match(decided, /olko-adr-store-reconcile for this project/);
  const clean = render({ "store-context": { "store-context": { noStore: false, digest: DIGEST, blocked: [] } } });
  assert.match(clean, /Project store: no overlapping ADR topics\./);
  assert.doesNotMatch(clean, /olko-adr-store-reconcile/);
});

for (const [workflow, prefix, context, input] of [
  ["olko-review-rules", "rules-", "rules-store-context", {}],
  ["olko-review-plan-rules", "plan-", "plan-store-context", { plan: "docs/plan.md" }],
  ["olko-impl-tests-first", "tests-", "tests-store-context", {}],
] as const) {
  test(`${workflow}: stop on an overlapping topic ends the run before the next step`, async () => {
    const factory = await newFactory();
    const { run } = factory.start("stop", undefined, { workflow, input });
    factory.confirm(run.runId);
    const agents: Record<string, Handler> = {
      [context]: () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      stacks: () => json({ stacks: ["dotnet"], authors: [{ id: "dotnet", agentName: "olko-test-first-author" }], implementers: [], runners: [] }),
    };
    const { run: end, prompts, questions } = await drive(factory, run.runId, agents, { [`q-${prefix}store`]: "stop" });
    assert.notEqual(end.status, "done");
    assert.equal(questions.length, 1);
    assert.match(questions[0].text, /logging\.format: ADR-0001 ADR-0002/);
    assert.deepEqual(Object.keys(prompts).sort(), [context, ...(workflow === "olko-impl-tests-first" ? ["stacks"] : [])].sort(), "nothing runs after stop");
  });
}

test("impl build asks again only when the test-first step did not decide the overlapping topics", async () => {
  const { loadedWorkflows } = await import("../src/engine.ts");
  const { evaluateWhen } = await import("../src/when.ts");
  const edge = loadedWorkflows().get("olko-impl-build")!.edges.find((e: any) => e.from === "store-context" && e.to === "ask-store") as any;
  const blocked = { "store-context": { "store-context": { blocked: [BLOCKED] } } };
  assert.equal(evaluateWhen(edge.when, blocked), true);
  assert.equal(evaluateWhen(edge.when, { ...blocked, "tests-ask-store": { answer: "logging.format=ADR-0002" } }), false);
});
