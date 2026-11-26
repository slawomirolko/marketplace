import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { Factory } = await import("../src/engine.ts");
const { loadWorkflowDir } = await import("../src/workflow-yaml.ts");

const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const FENCE = "`".repeat(3);
const BLOCKER = "blocker | grill-with-docs cannot be loaded";
const PASS = "consistency | pass | 0 | none";
const FAIL = "consistency | fail | 1 | stack.md misses a dependency";
const WORKFLOWS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "workflows");
const PHASES = ["olko-plan-discovery", "olko-plan-entry", "olko-plan-package", "olko-plan-audit", "olko-plan-review-files", "olko-plan-grill", "olko-plan-readiness", "olko-plan-finalize"];
const UNREACHABLE: Record<string, string> = {
  "entry-stop -> investigate": "entry-stop is a builtin.stop node: it always throws and fails the run, so its exit edge never fires",
};
const RUNS: ReturnType<InstanceType<typeof Factory>["get"]>[] = [];

type Reply = (nodePath: string, step: string, visit: number) => string | undefined;

function json(body: unknown): string {
  return `Done.\n${FENCE}json\n${JSON.stringify(body)}\n${FENCE}`;
}

const QUESTION = { text: "Problem: scope\n1. keep (recommended)\n2. widen\n3. drop" };
const AUDITOR = { id: "dotnet", agentName: "olko-dotnet-auditor" };

const DEFAULTS: Record<string, string> = {
  "route-grill": "Discovery, planning or both?",
  draft: json({ questions: [], decisions: [], feature: { title: "Approval gate", goal: "Gated ops wait", criteria: ["AC1"] }, tasks: [{ id: "T1", title: "Gate", criteria: ["AC1"] }], hierarchy: "- Feature: Approval gate\n  - T1: Gate" }),
  "draft-consistency": PASS,
  "review-grill": "Approve or revise?",
  feature: json({ ok: true, featureId: "f1", featureDir: "plans/features/f1", feature: "Approval gate", tasks: "T1: AC1", taskIds: ["T1"], criteria: "AC1", reason: "" }),
  investigate: "evidence at src/engine.ts:1",
  business: "business.md written",
  merge: "implementation.md written",
  stack: "stack | none",
  consistency: PASS,
  fix: "fixed | stack.md",
  "record-gap": "recorded | GAP-1",
  auditors: json({ agents: [], skipped: "no planned technology" }),
  audit: "nothing found",
  "audit-merge": json({ findings: [] }),
  "fold-audit": "folded",
  "plan-files": json({ files: [] }),
  grill: json({ questions: [] }),
  "grill-review": json({ questions: [QUESTION] }),
  "grill-record": "recorded | 1",
  "grill-apply": json({ changes: [], areas: [] }),
  cleanup: "cleaned",
  "e2e-matrix": "plans/features/f1/e2e/T1.acceptance.json\nAC1 | scenario | gated | test",
  "e2e-validate": "validation | pass | /repo/plans/features/f1/e2e/T1.acceptance.json | none",
  "e2e-fold": "e2e | T1 | pass",
  readiness: json({ questions: [] }),
  "readiness-review": json({ questions: [QUESTION] }),
  "blocker-record": "recorded | 1",
  "blocker-apply": "applied",
  "knowledge-final": "no note changes",
  domain: "Domain changes written",
  memory: "memory updated",
  report: "Ready for implementation: yes",
};

function answerOf(id: string, route: string): string {
  if (id === "q-plan-route") return route;
  if (id.startsWith("q-plan-draft-review")) return "approve";
  return "1";
}

async function drive(input: { route?: string }, reply: Reply = () => undefined, { answerRoute = "planning" }: { answerRoute?: string } = {}) {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-edges-top-")), { backend: "delegate" });
  const { run } = factory.start("plan documentation", undefined, { workflow: "olko-plan-documentation", input: { project: "/repo", idea: "approval gate", featureId: "f1", ...input, switches: { tracker: false, editor: false } } });
  factory.confirm(run.runId);
  const visits: Record<string, number> = {};
  const asked: string[] = [];
  for (let i = 0; i < 2000; i++) {
    const view = factory.status(factory.get(run.runId));
    if (ENDED.has(view.status)) break;
    if (view.status === "waiting_for_user") {
      const id = view.pendingQuestion!.id;
      asked.push(id);
      factory.answer(run.runId, id, answerOf(id, answerRoute));
    } else if (view.status === "waiting_for_client") {
      for (const work of view.pendingWorkItems ?? []) {
        const step = work.nodePath.split("/").pop()!;
        const visit = (visits[`${work.nodePath}#${work.agentId}`] ?? 0) + 1;
        visits[`${work.nodePath}#${work.agentId}`] = visit;
        const output = reply(work.nodePath, step, visit) ?? DEFAULTS[step];
        if (output === undefined) throw new Error(`unexpected step ${work.nodePath}`);
        factory.submit(run.runId, work.nodePath, output, { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 }, work.agentId);
      }
    } else {
      await new Promise((r) => setTimeout(r, 1));
    }
  }
  const done = factory.get(run.runId);
  RUNS.push(done);
  return { done, asked, edges: done.events.filter((e) => e.type === "edge_taken").map((e) => `${e.from} -> ${e.to}`) };
}

function stoppedBy(run: { status: string; events: { error?: unknown }[] }, reason: RegExp): boolean {
  return run.status === "failed" && run.events.some((e) => reason.test(String(e.error ?? "")));
}

function linkingEdges(): string[] {
  const workflows = loadWorkflowDir(WORKFLOWS);
  const inner = new Set(PHASES.flatMap((name) => workflows.get(name)!.edges.map((e) => `${e.from} -> ${e.to}`)));
  return workflows.get("olko-plan-documentation")!.edges.map((e) => `${e.from} -> ${e.to}`).filter((key) => !inner.has(key));
}

test("a planning route skips discovery, and a plan with no auditor, no plan file, no grill question and no blocker goes straight through every phase", async () => {
  const { done, asked, edges } = await drive({ route: "planning" });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, [], "nothing is asked of the user");
  assert.ok(!edges.some((e) => e.endsWith("-> draft")), "discovery never runs");
  for (const edge of ["route -> tracker-context", "feature -> investigate", "gate-merge/consistency -> auditors", "auditors -> plan-files", "plan-next -> grill-round", "grill -> cleanup", "readiness -> tracker-triage"]) assert.ok(edges.includes(edge), edge);
});

test("a discovery route ends with the discovery report after the draft is approved and plans nothing", async () => {
  const { done, asked, edges } = await drive({ route: "discovery" });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.ok(asked.some((id) => id.startsWith("q-plan-draft-review")));
  assert.deepEqual(edges.slice(-3), ["tracker-publish -> after-discovery", "after-discovery -> discovery-report", "discovery-report -> END"]);
  assert.ok(!edges.includes("route -> tracker-context") && !edges.some((e) => e.endsWith("-> investigate")), "planning never starts");
});

test("a both route plans the approved draft, records a gap after three failed corrections, and goes on when the reviewers reject every question", async () => {
  const { done, edges } = await drive({ route: "both" }, (nodePath, step) => {
    if (nodePath.includes("gate-merge/") && step === "consistency") return FAIL;
    if (step === "auditors") return json({ agents: [AUDITOR], skipped: "" });
    if (step === "grill") return json({ questions: [QUESTION] });
    if (step === "grill-review") return json({ questions: [] });
    if (step === "readiness") return json({ questions: [QUESTION] });
    if (step === "readiness-review") return json({ questions: [] });
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  for (const edge of ["route -> draft", "after-discovery -> tracker-context", "gate-merge/record-gap -> auditors", "audit-merge -> plan-files", "grill-review -> cleanup", "readiness-review -> tracker-triage"]) assert.ok(edges.includes(edge), edge);
  assert.ok(!edges.includes("after-discovery -> discovery-report"), "both does not end after discovery");
});

test("without a route the routing question is composed by the grill and a planning answer skips discovery; three grill and blocker rounds end each phase", async () => {
  const { done, asked, edges } = await drive({}, (nodePath, step) => {
    if (step === "auditors") return json({ agents: [AUDITOR], skipped: "" });
    if (step === "audit-merge") return json({ findings: ["dotnet | sealed | src/a.cs:1 | seal it"] });
    if (step === "grill") return json({ questions: [QUESTION] });
    if (step === "readiness") return json({ questions: [QUESTION] });
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(asked[0], "q-plan-route");
  assert.equal(asked.filter((id) => id.startsWith("q-plan-grill-")).length, 3, "three grill rounds, one question each");
  assert.equal(asked.filter((id) => id.startsWith("q-plan-blocker-")).length, 3, "three blocker rounds, one question each");
  for (const edge of ["route -> route-grill", "route-grill -> ask-route", "ask-route -> tracker-context", "gate-audit/consistency -> plan-files", "grill-round -> cleanup", "blocker-round -> tracker-triage"]) assert.ok(edges.includes(edge), edge);
});

test("a discovery answer to the routing question ends with the discovery report", async () => {
  const { done, edges } = await drive({}, () => undefined, { answerRoute: "discovery" });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  for (const edge of ["ask-route -> draft", "after-discovery -> discovery-report", "discovery-report -> END"]) assert.ok(edges.includes(edge), edge);
});

test("an audit fix that stays inconsistent after three corrections records a gap and goes on to the plan review", async () => {
  const { done, edges } = await drive({ route: "planning" }, (nodePath, step) => {
    if (step === "auditors") return json({ agents: [AUDITOR], skipped: "" });
    if (step === "audit-merge") return json({ findings: ["dotnet | sealed | src/a.cs:1 | seal it"] });
    if (nodePath.includes("gate-audit/") && step === "consistency") return FAIL;
    return undefined;
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.ok(edges.includes("gate-audit/record-gap -> plan-files"));
  assert.equal(edges.filter((e) => e === "gate-audit/round -> gate-audit/fix").length, 3, "three corrections before the gap");
});

test("a routing grill that cannot load its skill stops the run without asking the user", async () => {
  const { done, asked, edges } = await drive({}, (_nodePath, step) => (step === "route-grill" ? BLOCKER : undefined));
  assert.ok(stoppedBy(done, /grill-with-docs cannot be loaded/), JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, []);
  assert.ok(edges.includes("route-grill -> route-blocked"));
});

test("an entry gate that fails stops planning before any investigation", async () => {
  const { done, edges } = await drive({ route: "planning" }, (_nodePath, step) => (step === "feature" ? json({ ok: false, featureId: "", featureDir: "", feature: "", tasks: "", taskIds: [], criteria: "", reason: "T1 has no acceptance criteria" }) : undefined));
  assert.ok(stoppedBy(done, /Entry gate/), JSON.stringify(done.events.at(-1)));
  assert.ok(edges.includes("feature -> entry-stop"));
  assert.ok(!edges.includes("entry-stop -> investigate"), "the stop node never hands over to the package phase");
});

test("the scenarios above take every linking edge between the phases of the plan documentation workflow", () => {
  const links = linkingEdges();
  assert.ok(links.length > 0);
  for (const edge of Object.keys(UNREACHABLE)) assert.ok(links.includes(edge), `${edge} is a linking edge`);
  const taken = new Set(RUNS.flatMap((run) => run.events.filter((e) => e.type === "edge_taken").map((e) => `${e.from} -> ${e.to}`)));
  assert.deepEqual(links.filter((edge) => !taken.has(edge) && !(edge in UNREACHABLE)), []);
});
