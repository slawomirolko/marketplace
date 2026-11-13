import test from "node:test";
import assert from "node:assert/strict";
import { groupComments, memoryDecisionLines, memoryLists, parseFindings, parseRulesCheck, parseVerdicts, splitDiff, tierOf } from "../src/ops.ts";
import type { RulesCheck } from "../src/ops.ts";

const DIFF = [
  "diff --git a/src/a.mjs b/src/a.mjs",
  "+++ b/src/a.mjs",
  "+const x = 1;",
  "diff --git a/tool/run.py b/tool/run.py",
  "+++ b/tool/run.py",
  "+print(1)",
  "",
].join("\n");

test("a PR diff is split per file", () => {
  assert.deepEqual(splitDiff(DIFF).map((f) => f.path), ["src/a.mjs", "tool/run.py"]);
});

test("lens output lines become findings; prose and wrapped lines are handled", () => {
  assert.deepEqual(parseFindings("none"), []);
  const [f] = parseFindings("`src/a.mjs:1 | bug.logic | bug | wrong | fix`");
  assert.equal(f?.location, "src/a.mjs:1");
  const [kept] = parseFindings("a.py:1 | r | risk | p | close in `finally`");
  assert.equal(kept?.fix, "close in `finally`");
});

test("verifier lines become verdicts and keep trailing backticks", () => {
  assert.equal(parseVerdicts("CONFIRMED | a\nnoise\nREJECTED | b | why")[1]?.verdict, "REJECTED");
  assert.match(parseVerdicts("CONFIRMED | a.py:1 | r | nit | p | `node_function`")[0]?.rest ?? "", /`node_function`$/);
});

const TIER_CASES: [string, string, string][] = [
  ["bug.logic", "bug", "bug"],
  ["olko-dotnet-security.x", "risk", "security"],
  ["repo.rule", "risk", "repo-rule"],
  ["olko-design-rules.dry", "risk", "design"],
  ["olko-react-style.naming", "risk", "style"],
  ["bug.logic", "nit", "nit"],
];
for (const [ruleId, sev, tier] of TIER_CASES) {
  test(`finding ${ruleId} (${sev}) ranks as ${tier}`, () => assert.equal(tierOf({ ruleId, sev }), tier));
}

test("memory lines give suppressed patterns (rejected twice) and prioritized patterns (confirmed once)", () => {
  const text = ["---", "label: olko-review-orchestrator", "---", "rejected:style.naming", "- rejected:style.naming", "rejected:bug.null", "confirmed:bug.null", "noise"].join("\n");
  assert.deepEqual(memoryLists(text), { suppress: ["style.naming"], prioritize: ["bug.null"] });
});

test("post answers become memory lines; unanswered findings record nothing", () => {
  const kept = [{ ruleId: "bug.a" }, { ruleId: "style.b" }, { ruleId: "sec.c" }];
  assert.deepEqual(memoryDecisionLines(kept, { "q-post-0": "post", "q-post-1": "skip" }, "q-post-"), ["confirmed:bug.a", "rejected:style.b"]);
});

const RULES_CASES: [string, string, RulesCheck][] = [
  ["no store", "no-store", { noStore: true, violations: [], verdicts: [] }],
  ["nothing found", "none", { noStore: false, violations: [], verdicts: [] }],
  [
    "violations and verdicts",
    "violation | a.ts:3 | project.0001-api | bug | breaks it | fix it | docs/adr/0001.md#Decision | \"MUST use X\"\nkeep | a.ts:1 | bug.x | bug | p | f | -\ndrop | a.ts:2 | style.y | nit | p | f | docs/rules/style.md#Names\nask | a.ts:4 | sec.z | risk | p | f | docs/adr/0002.md#Decision",
    {
      noStore: false,
      violations: ["a.ts:3 | project.0001-api | bug | breaks it | fix it | docs/adr/0001.md#Decision | \"MUST use X\""],
      verdicts: [
        { verdict: "keep", finding: "a.ts:1 | bug.x | bug | p | f", cite: "-" },
        { verdict: "drop", finding: "a.ts:2 | style.y | nit | p | f", cite: "docs/rules/style.md#Names" },
        { verdict: "ask", finding: "a.ts:4 | sec.z | risk | p | f", cite: "docs/adr/0002.md#Decision" },
      ],
    },
  ],
];
for (const [label, text, expected] of RULES_CASES) {
  test(`project rules check output: ${label}`, () => assert.deepEqual(parseRulesCheck(text), expected));
}

test("review comments on the same file within three lines form one item; PR-level comments stay separate", () => {
  const base = { kind: "thread" as const, author: "a", body: "b", url: "u" };
  const items = groupComments([
    { ...base, id: "1", path: "a.ts", line: 10 },
    { ...base, id: "2", path: "a.ts", line: 12 },
    { ...base, id: "3", path: "a.ts", line: 20 },
    { ...base, id: "4", path: "b.ts", line: 11 },
    { ...base, id: "5", kind: "comment", path: null, line: null },
  ]);
  assert.deepEqual(items.map((i) => i.comments.map((c) => c.id)), [["1", "2"], ["3"], ["4"], ["5"]]);
  assert.deepEqual(items.map((i) => i.index), [0, 1, 2, 3]);
});
