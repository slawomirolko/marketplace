import assert from "node:assert/strict";
import test from "node:test";
import { driveWorkflow, fencedJson, stoppedBy, type PlanRun } from "./helpers/plan-driver.ts";

process.env.FACTORY_TURN_DELAY_MS = "0";
const { missingEdges, SCENARIOS_FILTERED } = await import("./edge-coverage.ts");

const json = (body: unknown): string => fencedJson(body, "Done.");

const WORKFLOW = "olko-plan-review-files";
const RUNS: PlanRun[] = [];

const FINDING = "plan: step 2 | design.kiss | medium | two lists for one queue | keep one list";
const VIOLATION = "plan: step 3 | logs plain text | ADR-0007 asks for structured logs";
const RULE_ASK = { kind: "ask", line: "plan: step 1 | design.yagni | low | extra flag | drop it", cite: "ADR-0003 keeps the flag" };
const OVERLAP = { topic: "logging.format", adrs: ["ADR-0007", "ADR-0009"], paths: ["src/log.ts"] };
const PR_FINDING = "src/a.ts:12 | bugs.null | high | null not checked | add a guard";
const PR_SECOND = "src/a.ts:30 | style.name | nit | short name | rename";
const ITEM = (index: number) => ({ index, path: "src/a.ts", line: 10 + index, comments: [{ id: `t${index}`, kind: "thread", author: "reviewer", url: `https://example.invalid/${index}`, body: `comment ${index}` }] });

function files(count: number): string {
  return json({ files: Array.from({ length: count }, (_, i) => ({ path: i === 0 ? "plans/f1/implementation.md" : `plans/f1/tasks/T${i}-implementation.md`, criteria: "AC1: decline runs no op" })) });
}

function merge(over: Record<string, unknown> = {}): string {
  return json({ noStore: false, kept: [], dropped: [], violations: [], decide: [], violationEntries: [], ...over });
}

const DEFAULTS: Record<string, string> = {
  "plan-files": files(1),
  route: "PLAN | input plan is set",
  "plan-lens": "none",
  "plan-verify": "none",
  "plan-confirm": json({ confirmed: [], dropped: [] }),
  "plan-store-context": json({ noStore: true, digest: [], blocked: [] }),
  "plan-rules": "no-store",
  "plan-rules-merge": merge({ noStore: true }),
  "plan-verify-violations": "CONFIRMED",
  "plan-rule-decided": json({ decided: [] }),
  "plan-report": json({ kept: [] }),
  "fold-review": "folded | implementation.md",
  stack: "stack | none",
  consistency: "consistency | pass | 0 | none",
  fix: "fixed | implementation.md",
  "record-gap": "recorded | GAP-1",
  scope: json({ pr: 7, repo: "owner/name", title: "Approval gate", body: "AC1", head: "feature/gate", stale: false, files: ["src/a.ts"], excluded: [], lenses: [{ id: "bugs", agentName: "olko-review-bugs-lens", paths: ["src/a.ts"] }], unreviewed: [], criteria: "AC1" }),
  diff: "diff --git a/src/a.ts b/src/a.ts",
  memory: json({ loaded: true, file: "memory/review.md", suppressText: "none", prioritizeText: "none" }),
  lenses: "none",
  merge: json({ findings: [], missing: [] }),
  verify: "CONFIRMED",
  confirm: json({ confirmed: [], dropped: [] }),
  "rules-store-context": json({ noStore: true, digest: [], blocked: [] }),
  "rules-check": "no-store",
  "rules-merge": merge({ noStore: true }),
  "verify-violations": "CONFIRMED",
  "rule-decided": json({ decided: [] }),
  "local-rank": json({ kept: [] }),
  rank: json({ kept: [] }),
  "post-one": json({ posted: [PR_FINDING] }),
  "memory-save": "saved",
  "fb-check": json({ headOk: true, head: "feature/gate", ci: "build: pass", items: [] }),
  "fb-assess": "recommend | fix | guard the null | the value can be null",
  "fb-plan": json({ fixes: 0, fixItems: [], replies: [] }),
  "fb-fix": "pass | src/a.ts guarded",
  "fb-draft": "Kept as is: the caller checks the value.",
  "fb-post": json({ posted: ["https://example.invalid/reply-1"] }),
  "fb-report": "CI pass, one fix, one reply posted.",
};

/** A scripted reply: one text for every visit, or one per visit with the last repeated. */
type Reply = string | string[];

interface Script {
  /** The reply of each step that differs from DEFAULTS. */
  replies?: Record<string, Reply>;
  /** The answer to each question, keyed by its local id (the part after the last colon). */
  answers?: Record<string, string>;
  /** The answer to any question not in `answers`; without it such a question fails the test. */
  otherwise?: string;
}

function replyFor(reply: Reply | undefined, visit: number): string | undefined {
  return Array.isArray(reply) ? reply[Math.min(visit, reply.length) - 1] : reply;
}

function answerFor({ answers = {}, otherwise }: Script, questionId: string): string {
  const answer = answers[questionId.split(":").pop() ?? questionId] ?? otherwise;
  if (answer === undefined) {
    throw new Error(`unexpected question ${questionId}`);
  }
  return answer;
}

async function drive(script: Script = {}) {
  return driveWorkflow({ workflow: WORKFLOW, goal: "review plan files", input: { project: "/repo" }, tempPrefix: "factory-plan-review-files-", reply: (work) => replyFor(script.replies?.[work.step], work.visit) ?? DEFAULTS[work.step], answer: (questionId) => answerFor(script, questionId), runs: RUNS });
}

test("two plan files without confirmed findings are each reviewed on the PLAN route and nothing is folded", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      "plan-files": files(2),
    },
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["route"]!.length, 2, "one review call per plan file");
  assert.match(prompts["plan-lens"]![0]!, /Plan file: plans\/f1\/implementation\.md/);
  assert.match(prompts["plan-lens"]![1]!, /Plan file: plans\/f1\/tasks\/T1-implementation\.md/);
  assert.match(prompts["plan-lens"]![0]!, /Acceptance criteria: AC1: decline runs no op/);
  assert.equal(prompts["fold-review"], undefined);
  assert.equal(prompts["stack"], undefined, "no consistency gate without a fold");
  assert.deepEqual(asked, []);
});

test("a confirmed finding is folded into the plan and the consistency gate runs before the next file", async () => {
  const { done, prompts } = await drive({
    replies: {
      "plan-files": files(2),
      "plan-report": json({ kept: [{ line: FINDING, ruleId: "design.kiss", sev: "medium", tier: "design", unchecked: false }] }),
    },
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["fold-review"]!.length, 2);
  assert.match(prompts["fold-review"]![0]!, new RegExp(`- ${FINDING.replace(/[|.]/g, "\\$&")}`), "the fold sees the kept finding");
  assert.match(prompts["fold-review"]![0]!, /record the review result of plans\/f1\/implementation\.md/);
  assert.equal(prompts["consistency"]!.length, 2, "one gate per fold");
});

test("a consistency gate that still fails after three corrections records a GAP item and the review goes on", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      "plan-report": json({ kept: [{ line: FINDING, ruleId: "design.kiss", sev: "medium", tier: "design", unchecked: false }] }),
      consistency: "consistency | fail | 1 | Task T1 names no milestone",
    },
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["consistency"]!.length, 4);
  assert.equal(prompts["fix"]!.length, 3);
  assert.match(prompts["record-gap"]![0]!, /Task T1 names no milestone/);
  assert.deepEqual(asked, [], "the gate asks nothing");
});

test("a store violation and a rule question on the PLAN route are each put to the user before the report", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      "plan-rules-merge": merge({ violations: [VIOLATION], decide: [RULE_ASK], violationEntries: ["project.adr-0007.md"] }),
      "plan-rules-violations": json({ decide: [RULE_ASK, { kind: "violation", line: VIOLATION, cite: "ADR-0007#Logging" }] }),
    },
    answers: { "q-plan-rule-0": "finding" },
    otherwise: "store",
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked.map((id) => id.split(":").pop()), ["q-plan-rule-0", "q-plan-rule-1"]);
  assert.match(prompts["plan-verify-violations"]![0]!, /Findings \(1\)[\s\S]*logs plain text/);
  assert.match(prompts["plan-rule-decided"]![1]!, /The user's answer: store/);
  assert.match(prompts["plan-report"]![0]!, /Store violations per entry: project\.adr-0007\.md 1;/);
});

test("an overlapping store topic asks for the binding ADR once, and a rule question without violations is still asked", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      "plan-store-context": json({ noStore: false, digest: [], blocked: [OVERLAP] }),
      "plan-rules-merge": merge({ decide: [RULE_ASK] }),
    },
    answers: { "q-plan-store": "logging.format=ADR-0007" },
    otherwise: "finding",
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked.map((id) => id.split(":").pop()), ["q-plan-store", "q-plan-rule-0"]);
  assert.match(prompts["plan-rules"]![0]!, /the user named the binding ADR: logging\.format=ADR-0007/);
  assert.equal(prompts["plan-verify-violations"], undefined);
  assert.equal(prompts["plan-rule-decided"]!.length, 1);
});

test("answering stop to an overlapping store topic on the PLAN route stops the run before the rules check", async () => {
  const { done, prompts } = await drive({
    replies: {
      "plan-store-context": json({ noStore: false, digest: [], blocked: [OVERLAP] }),
    },
    otherwise: "stop",
  });
  assert.ok(stoppedBy(done, /overlapping ADRs without a binding answer/), JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["plan-rules"], undefined);
});

test("a REVIEW route with memory posts the approved finding, skips the other and records both in memory", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      route: "REVIEW | the model chose a PR review",
      lenses: `${PR_FINDING}\n${PR_SECOND}`,
      merge: json({ findings: [PR_FINDING, PR_SECOND], missing: [] }),
      confirm: json({ confirmed: [{ line: PR_FINDING, unchecked: false }, { line: PR_SECOND, unchecked: false }], dropped: [] }),
      "rules-merge": merge({ kept: [{ line: PR_FINDING, unchecked: false }, { line: PR_SECOND, unchecked: false }], decide: [{ ...RULE_ASK, line: PR_SECOND }] }),
      rank: json({ kept: [{ line: PR_FINDING, ruleId: "bugs.null" }, { line: PR_SECOND, ruleId: "style.name" }] }),
    },
    answers: { "q-rule-0": "finding", "q-post-0": "post" },
    otherwise: "skip",
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked.map((id) => id.split(":").pop()), ["q-rule-0", "q-post-0", "q-post-1"]);
  assert.equal(prompts["plan-lens"], undefined, "the PLAN lens does not run on the REVIEW route");
  assert.equal(prompts["post-one"]!.length, 1, "only the approved finding is posted");
  assert.match(prompts["memory-save"]![0]!, /Posted:\s+- src\/a\.ts:12/);
});

test("a LOCAL route without memory continues on request and returns its ranked findings without posting", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      route: "LOCAL | input base is set",
      memory: json({ loaded: false, file: "memory/review.md", suppressText: "none", prioritizeText: "none" }),
      "rules-store-context": json({ noStore: false, digest: [], blocked: [OVERLAP] }),
      "rules-merge": merge({ violations: [VIOLATION], violationEntries: ["project.adr-0007.md"] }),
      "rules-violations": json({ decide: [{ kind: "violation", line: VIOLATION, cite: "ADR-0007#Logging" }] }),
    },
    answers: { "q-memory-missing": "continue", "q-rules-store": "logging.format=ADR-0007" },
    otherwise: "store",
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked.map((id) => id.split(":").pop()), ["q-memory-missing", "q-rules-store", "q-rule-0"]);
  assert.equal(prompts["verify"], undefined, "no lens finding, nothing to verify");
  assert.match(prompts["rules-check"]![0]!, /the user named the binding ADR: logging\.format=ADR-0007/);
  assert.match(prompts["local-rank"]![0]!, /Memory: not loaded/);
  assert.equal(prompts["rank"], undefined);
  assert.equal(prompts["post-one"], undefined);
});

test("stop at the missing-memory question ends the file review before any lens runs", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      route: "REVIEW | the model chose a PR review",
      memory: json({ loaded: false, file: "memory/review.md", suppressText: "none", prioritizeText: "none" }),
    },
    otherwise: "stop",
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(asked.length, 1);
  assert.equal(prompts["lenses"], undefined);
});

test("a REVIEW without memory and without kept findings posts nothing and saves no memory", async () => {
  const { done, prompts } = await drive({
    replies: {
      route: "REVIEW | the model chose a PR review",
      memory: json({ loaded: false, file: "memory/review.md", suppressText: "none", prioritizeText: "none" }),
    },
    otherwise: "continue",
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["rank"]!.length, 1);
  assert.equal(prompts["post-one"], undefined);
  assert.equal(prompts["memory-save"], undefined);
});

test("answering stop to an overlapping store topic on the REVIEW route stops the run before the rules check", async () => {
  const { done, prompts } = await drive({
    replies: {
      route: "REVIEW | the model chose a PR review",
      "rules-store-context": json({ noStore: false, digest: [], blocked: [OVERLAP] }),
    },
    otherwise: "stop",
  });
  assert.ok(stoppedBy(done, /overlapping ADRs without a binding answer/), JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["rules-check"], undefined);
});

test("a FEEDBACK route decides each item, implements the agreed fix and posts only the approved reply", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      route: "FEEDBACK | own PR",
      "fb-check": json({ headOk: true, head: "feature/gate", ci: "build: pass", items: [ITEM(0), ITEM(1), ITEM(2)] }),
      "fb-plan": json({ fixes: 1, fixItems: [ITEM(0)], replies: [{ ...ITEM(1), decision: "wont-fix" }, { ...ITEM(2), decision: "question" }] }),
    },
    answers: { "q-feedback-0": "fix", "q-feedback-1": "wont-fix", "q-feedback-2": "question", "q-feedback-implement": "yes", "q-reply-0": "post", "q-reply-1": "skip" },
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["fb-assess"]!.length, 3, "one assessment per item");
  assert.match(prompts["fb-fix"]![0]!, /src\/a\.ts:10/);
  assert.equal(prompts["fb-draft"]!.length, 2);
  assert.equal(prompts["fb-post"]!.length, 1, "the skipped reply is not posted");
  assert.ok(asked.some((id) => id.endsWith("q-feedback-implement")));
});

test("with nothing to fix, or the fixes declined, the FEEDBACK route only reports", async () => {
  const { done, prompts, asked } = await drive({
    replies: {
      "plan-files": files(2),
      route: "FEEDBACK | own PR",
      "fb-check": json({ headOk: true, head: "feature/gate", ci: "build: pass", items: [ITEM(0)] }),
      "fb-plan": [json({ fixes: 0, fixItems: [], replies: [] }), json({ fixes: 1, fixItems: [ITEM(0)], replies: [] })],
    },
    answers: { "q-feedback-implement": "no" },
    otherwise: "skip",
  });
  assert.equal(done.status, "done", JSON.stringify(done.events.at(-1)));
  assert.equal(asked.filter((id) => id.endsWith("q-feedback-implement")).length, 1, "the implement question only comes with a fix");
  assert.equal(prompts["fb-fix"], undefined);
  assert.equal(prompts["fb-report"]!.length, 2);
  assert.match(prompts["fb-report"]![1]!, /Implementation: no\./);
});

test("a FEEDBACK route on a branch that is not the PR head stops the run without asking", async () => {
  const { done, asked } = await drive({
    replies: {
      route: "FEEDBACK | own PR",
      "fb-check": json({ headOk: false, head: "feature/gate", ci: "build: pass", items: [ITEM(0)] }),
    },
  });
  assert.ok(stoppedBy(done, /not the PR head branch/), JSON.stringify(done.events.at(-1)));
  assert.deepEqual(asked, []);
});

test("a failed fix on the FEEDBACK route stops the run before any reply is drafted", async () => {
  const { done, prompts } = await drive({
    replies: {
      route: "FEEDBACK | own PR",
      "fb-check": json({ headOk: true, head: "feature/gate", ci: "build: pass", items: [ITEM(0)] }),
      "fb-plan": json({ fixes: 1, fixItems: [ITEM(0)], replies: [] }),
      "fb-fix": "fail | the test of src/a.ts fails",
    },
    answers: { "q-feedback-implement": "yes" },
    otherwise: "fix",
  });
  assert.ok(stoppedBy(done, /a review fix or its verification failed/), JSON.stringify(done.events.at(-1)));
  assert.equal(prompts["fb-draft"], undefined);
});

test("the scenarios above take every edge of the plan review files workflow", { skip: SCENARIOS_FILTERED }, () => {
  assert.deepEqual(missingEdges(WORKFLOW, RUNS), []);
});
