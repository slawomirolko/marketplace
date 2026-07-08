import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const contextStoreScriptPath = path.join(scriptsDir, "context-store.mjs");

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-context-store-"));
}

function runContextStore(args) {
  return spawnSync(process.execPath, [contextStoreScriptPath, ...args], {
    encoding: "utf8",
  });
}

function contextPath(project, relativePath) {
  return path.join(project, ".agents", "context", ...relativePath.split("/"));
}

test("initializes the project context directory contract", () => {
  const project = makeProject();

  const result = runContextStore(["init", "--project", project]);

  assert.equal(result.status, 0, result.stderr);
  for (const directory of ["summaries", "summaries/archive", "scratchpad", "memory", "cache"]) {
    assert.equal(fs.existsSync(contextPath(project, directory)), true, directory);
  }
});

test("clears scratchpad without deleting skill memory", () => {
  const project = makeProject();
  assert.equal(runContextStore(["init", "--project", project]).status, 0);
  fs.writeFileSync(contextPath(project, "scratchpad/current.json"), '{"task":"active"}\n');
  fs.writeFileSync(contextPath(project, "memory/olko-test.md"), "keep this\n");

  const result = runContextStore(["clear-scratchpad", "--project", project]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(contextPath(project, "scratchpad/current.json")), false);
  assert.equal(fs.readFileSync(contextPath(project, "memory/olko-test.md"), "utf8"), "keep this\n");
});

test("rotates summaries with a retention limit", () => {
  const project = makeProject();
  assert.equal(runContextStore(["init", "--project", project]).status, 0);

  for (let index = 0; index < 4; index += 1) {
    fs.writeFileSync(contextPath(project, "summaries/latest.md"), `summary ${index}\n`);
    const result = runContextStore(["rotate-summary", "--project", project, "--keep", "2"]);
    assert.equal(result.status, 0, result.stderr);
  }

  const archive = fs.readdirSync(contextPath(project, "summaries/archive")).filter((file) => file.endsWith(".md"));
  assert.equal(archive.length, 2);
  assert.equal(fs.existsSync(contextPath(project, "summaries/latest.md")), false);
});

test("writes latest summary and bounded replacement skill memory", () => {
  const project = makeProject();
  const input = path.join(project, "summary.md");
  fs.writeFileSync(input, ["decision: use files", "next: load summary", ""].join("\n"));

  const result = runContextStore([
    "write-summary",
    "--project",
    project,
    "--skill",
    "olko-test",
    "--input",
    input,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(contextPath(project, "summaries/latest.md"), "utf8"), "decision: use files\nnext: load summary\n");
  assert.equal(fs.readFileSync(contextPath(project, "memory/olko-test.md"), "utf8"), "decision: use files\nnext: load summary\n");
});
