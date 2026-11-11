import test from "node:test";
import assert from "node:assert/strict";
import { parseFindings, parseVerdicts, splitDiff, tierOf } from "../src/ops.ts";

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
