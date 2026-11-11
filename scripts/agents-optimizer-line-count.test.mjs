import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(repoRoot, "skills", "ai", "olko-agents-optimizer", "scripts", "line-count.mjs");

function measure(content, ...extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "line-count-"));
  const file = path.join(dir, "target.md");
  fs.writeFileSync(file, content);
  const result = spawnSync(process.execPath, [script, file, ...extra], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("agent prompt: type, allowed skills, numbered sections and token estimate", () => {
  const stats = measure([
    "---",
    "description: Example agent.",
    "mode: subagent",
    "permission:",
    "  skill:",
    '    "*": deny',
    "    olko-test: allow",
    "  bash: deny",
    "---",
    "HARD RULE — EXAMPLE: never do it.",
    "1. First step does one thing.",
    "2. Second step does another thing.",
  ].join("\n"));

  assert.equal(stats.type, "agent");
  assert.deepEqual(stats.allowedSkills, ["olko-test"]);
  assert.equal(stats.sectionCount, 3);
  assert.ok(stats.estimatedTokens > 0);
  assert.ok(stats.words > 0);
});

test("prefix issues flag dates and absolute paths outside code fences", () => {
  const stats = measure([
    "# Context",
    "## Notes",
    "User rule 2026-01-02 applies.",
    "Read C:/Users/someone/file.md first.",
    "```",
    "2026-03-04 inside a fence is ignored",
    "```",
  ].join("\n"));

  assert.equal(stats.type, "context");
  assert.deepEqual(stats.prefixIssues.map((issue) => issue.rule).sort(), ["absolute-path", "date"]);
});

test("registry option reports allowed skill description lengths", () => {
  const stats = measure(
    ["---", "mode: subagent", "permission:", "  skill:", "    olko-test: allow", "---", "Body."].join("\n"),
    "--registry",
    path.join(repoRoot, "registry.json"),
  );

  assert.equal(stats.skillDescriptions.length, 1);
  assert.ok(stats.skillDescriptionChars > 0);
});
