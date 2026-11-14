import test from "node:test";
import assert from "node:assert/strict";
import { memoryLists, splitDiff, tierOf } from "../src/ops.ts";

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
