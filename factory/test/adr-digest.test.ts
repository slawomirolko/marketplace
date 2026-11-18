import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.FACTORY_TURN_DELAY_MS = "0";

type Handler = (prompt: string) => string;
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);

const json = (value: unknown) => "```json\n" + JSON.stringify(value) + "\n```";

async function drive(factory: any, runId: string, agents: Record<string, Handler>, answers: Record<string, string>): Promise<{ run: any; prompts: any; questions: any[] }> {
  const prompts: Record<string, string[]> = {};
  const questions: { id: string; text: string }[] = [];
  for (let i = 0; i < 2000; i++) {
    const run = factory.get(runId);
    if (ENDED.has(run.status)) return { run, prompts, questions };
    if (run.status === "waiting_for_client") {
      for (const item of run.pendingWorkItems ?? [run.pendingWork]) {
        const id = item.nodePath.split("/").pop();
        const handler = agents[id];
        if (!handler) throw new Error(`no scripted output for ${item.nodePath}`);
        (prompts[id] ??= []).push(item.prompt);
        factory.submit(runId, item.nodePath, handler(item.prompt), {}, item.agentId);
      }
      continue;
    }
    if (run.status === "waiting_for_user") {
      const q = run.pendingQuestion;
      questions.push({ id: q.id, text: q.text });
      const key = Object.keys(answers).find((k) => q.id.endsWith(k));
      if (!key) throw new Error(`no scripted answer for ${q.id}: ${q.text}`);
      factory.answer(runId, q.id, answers[key]);
      continue;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("the run did not end");
}

async function newFactory() {
  const { Factory } = await import("../src/engine.ts");
  return new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-adr-")), { backend: "delegate" });
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

test("plan rules: the digest and the unresolved topics reach the rules check", async () => {
  const factory = await newFactory();
  const { run } = factory.start("plan rules", undefined, { workflow: "olko-review-plan-rules", input: { plan: "docs/plan.md" } });
  factory.confirm(run.runId);
  const { run: end, prompts } = await drive(
    factory,
    run.runId,
    {
      "plan-store-context": () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      "plan-rules": () => "none",
      "plan-rules-merge": () => json({ noStore: false, kept: [], dropped: [], violations: [], decide: [] }),
    },
    {},
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["plan-store-context"][0], /read the plan file docs\/plan\.md/);
  assert.match(prompts["plan-rules"][0], /- ADR-0004 \[persistence\.orm\]: Use EF Core for data access\./);
  assert.match(prompts["plan-rules"][0], /Unresolved topic logging\.format \(ADR-0001 ADR-0002 \)/);
});

test("store reconcile: batches, then groups found after the front matter, one question each; writes only after an approval; skip and stop write nothing", async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "adr-project-"));
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
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "adr-empty-"));
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

test("code review rules: the digest and unresolved topics reach the rules check; the merge counts violations per store entry", async () => {
  const factory = await newFactory();
  const { run } = factory.start("review rules", undefined, { workflow: "olko-review-rules", input: {} });
  factory.confirm(run.runId);
  const { run: end, prompts } = await drive(
    factory,
    run.runId,
    {
      "rules-store-context": () => json({ noStore: false, digest: DIGEST, blocked: [BLOCKED] }),
      "rules-check": () => "none",
      "rules-merge": () => json({ noStore: false, kept: [], dropped: [], violations: [], decide: [], perEntry: [] }),
    },
    {},
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["rules-check"][0], /^\s*Project store digest for these paths/);
  assert.match(prompts["rules-check"][0], /- ADR-0004 \[persistence\.orm\]: Use EF Core for data access\./);
  assert.match(prompts["rules-check"][0], /Unresolved topic logging\.format \(ADR-0001 ADR-0002 \)/);
  assert.match(prompts["rules-merge"][0], /perEntry: one item per store entry/);
});

test("tests first: the test author gets the digest of the Task plan paths, and an unresolved topic becomes a Blocked: item", async () => {
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
    {},
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["tests-store-context"][0], /read the approved Task plan/);
  assert.match(prompts["write-tests"][0], /^\s*Project store digest for this Task/);
  assert.match(prompts["write-tests"][0], /Unresolved store topic logging\.format \(ADR-0001 ADR-0002 \).*Blocked:/);
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
      "plan-rules-merge": () => json({ noStore: false, kept: [], dropped: [], violations: [], decide: [], perEntry: [{ entry: "project.0004-ef-core", count: 2 }] }),
      "plan-report": () => json({ kept: [] }),
    },
    {},
  );
  assert.equal(end.status, "done", end.error);
  assert.match(prompts["plan-report"][0], /Store violations per entry: project\.0004-ef-core 2;/);
  assert.match(prompts["plan-report"][0], /Unresolved store topics .*logging\.format \(ADR-0001 ADR-0002 \)/);
  assert.match(prompts["plan-report"][0], /olko-adr-store-reconcile/);
});
