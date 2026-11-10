import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Factory } from "../src/engine.mjs";
import { REVIEW_WORKFLOW, parseFindings, parseVerdicts, splitDiff, tierOf } from "../src/workflows/olko-review.mjs";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewJson = JSON.parse(fs.readFileSync(path.join(factoryDir, "workflows", "olko-review.json"), "utf8"));

const DIFF = [
  "diff --git a/src/a.mjs b/src/a.mjs",
  "+++ b/src/a.mjs",
  "+const x = 1;",
  "diff --git a/tool/run.py b/tool/run.py",
  "+++ b/tool/run.py",
  "+print(1)",
  "diff --git a/app/pnpm-lock.yaml b/app/pnpm-lock.yaml",
  "+lock",
  "",
].join("\n");

function fakeExec(command, args) {
  if (command !== "gh") return { code: 1, stdout: "", stderr: "unexpected" };
  if (args[1] === "view") return { code: 0, stdout: JSON.stringify({ title: "t", body: "b", headRefName: "h", author: { login: "x" } }), stderr: "" };
  return { code: 0, stdout: DIFF, stderr: "" };
}

function lensExecutor({ agent }) {
  const text = agent === "olko-review-bugs-lens"
    ? "src/a.mjs:1 | bug.logic | bug | wrong value | fix it\nsrc/a.mjs:1 | sec.secret | risk | leaks a secret | remove it"
    : agent === "olko-review-python-lens" ? "none"
    : "CONFIRMED | src/a.mjs:1 | bug.logic | bug | wrong value | fix it\nREJECTED | src/a.mjs:1 | sec.secret | risk | leaks a secret | remove it | not in diff";
  return { ok: true, text, turns: 1, usageByModel: [{ model: "opencode/deepseek-v4.1-flash-free", tokens: { input: 100, output: 10, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }, cacheWriteTtlKnown: true, harnessCostUsd: 0 }], durationMs: 1 };
}

test("workflow file lists the same nodes as the engine workflow", () => {
  assert.deepEqual(reviewJson.nodes.map((n) => n.id), REVIEW_WORKFLOW.nodes.map((n) => n.id));
});

test("diff is split per file and lens output lines become findings", () => {
  assert.deepEqual(splitDiff(DIFF).map((f) => f.path), ["src/a.mjs", "tool/run.py", "app/pnpm-lock.yaml"]);
  assert.deepEqual(parseFindings("none"), []);
  const [f] = parseFindings("`src/a.mjs:1 | bug.logic | bug | wrong | fix`");
  assert.equal(f.location, "src/a.mjs:1");
  assert.equal(tierOf(f), "bug");
  assert.equal(tierOf({ ruleId: "olko-dotnet-security.x", sev: "risk" }), "security");
  assert.equal(parseVerdicts("CONFIRMED | a\nnoise\nREJECTED | b | why")[1].verdict, "REJECTED");
});

test("review run calls the real agent names per lens, verifies, ranks and prices every lens", async () => {
  const calls = [];
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "review-")), {
    executors: { exec: fakeExec, opencode: async (args) => { calls.push(args); return lensExecutor(args); } },
  });
  const { run } = factory.start("review", undefined, { workflow: "olko-review", input: { repo: "o/r", pr: 7, cwd: "/repo", agentConfigDir: "/cfg" } });
  factory.confirm(run.runId, { backend: { kind: "cli", cli: "opencode" }, tierModels: { medium: "opencode/deepseek-v4.1-flash-free" } });
  let current;
  do ({ run: current } = await factory.waitForChange(run.runId, 20000));
  while (current.status === "running");
  assert.equal(current.status, "done", JSON.stringify(current.events.filter((e) => /fail/.test(e.type))));
  assert.deepEqual(calls.map((c) => c.agent), ["olko-review-bugs-lens", "olko-review-python-lens", "olko-review-verifier"]);
  assert.ok(calls.every((c) => c.cwd === "/repo" && c.configDir === "/cfg"));
  assert.doesNotMatch(calls[0].prompt, /pnpm-lock/);
  const report = factory.report(current);
  assert.deepEqual(Object.keys(report.byNode["olko-review/lenses"].byAgent), ["bugs", "python"]);
  assert.equal(report.byNode["olko-review/lenses"].byAgent.bugs.agentName, "olko-review-bugs-lens");
  assert.equal(report.byCostSource.measured, 3);
  const final = current.ledger.at(-1);
  assert.equal(final.nodePath, "olko-review/rank");
  assert.match(final.output, /src\/a\.mjs:1 \| bug\.logic/);
  assert.match(final.output, /Dropped by the verifier: 1/);
  assert.match(final.output, /Not reviewed \(generated lockfiles\): app\/pnpm-lock\.yaml/);
});
