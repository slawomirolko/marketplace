// The marketplace lock and the project status scan read installed artifacts through one model
// (skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs). This test runs
// both tools on the same project and checks that they give the same state, version and base for
// every copy. All fixture values are fictional.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isAdapterFile, modelLine, portableText } from "../skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const lockScript = path.join(scriptsDir, "olko-marketplace-lock.mjs");
const scanScript = path.join(scriptsDir, "..", "skills", "software-factory", "olko-factory-project", "scripts", "project-scan.mjs");

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.autocrlf=false", ...args], { encoding: "utf8" }).trim();
}

function write(root, relativePath, text) {
  const file = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const crlf = (text) => text.replace(/\n/g, "\r\n");
const skillText = (name, body, version = "0.0.1") => `---\nname: ${name}\nversion: ${version}\ndescription: Sample.\n---\n# ${name}\n${body}\n`;
const agentText = (model, body) => `---\ndescription: Sample agent.\nmode: subagent\nmodel: ${model}\n---\n${body}\n`;

const registry = (versions) => JSON.stringify({ skills: Object.entries(versions).map(([name, version]) => ({ name, category: "demo", version })) }, null, 2);
const manifest = (versions) => JSON.stringify({ agents: Object.entries(versions).map(([name, version]) => ({ name, file: `${name}.md`, version })) }, null, 2);

/**
 * A marketplace with two commits and a project that holds one copy per case: adapted with `project.md`
 * and `*.local.*`, outdated, modified with a `*.local.*` adapter, unknown base, a CRLF copy under
 * `.claude/skills` whose version comes from front matter, an agent with a project model in CRLF, and
 * an outdated agent.
 */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "installed-artifacts-"));
  const market = path.join(root, "market");
  const project = path.join(root, "project");
  fs.mkdirSync(market);
  git(market, "init", "-q", "-b", "main");
  for (const name of ["sample-alpha", "sample-beta", "sample-gamma", "sample-delta"]) {
    write(market, `skills/demo/${name}/SKILL.md`, skillText(name, "step one"));
    write(market, `skills/demo/${name}/workflow.md`, `${name} flow v1\n`);
  }
  write(market, "skills/demo/sample-epsilon/SKILL.md", skillText("sample-epsilon", "epsilon", "3.0.0"));
  write(market, "agents/opencode/sample-helper.md", agentText("provider/model-a", "Help."));
  write(market, "agents/opencode/sample-scout.md", agentText("provider/model-a", "Scout v1."));
  write(market, "registry.json", registry({ "sample-alpha": "1.0.0", "sample-beta": "1.0.0", "sample-gamma": "1.0.0", "sample-delta": "1.0.0" }));
  write(market, "agents/opencode/index.json", manifest({ "sample-helper": "0.1.0", "sample-scout": "0.1.0" }));
  git(market, "add", "-A");
  git(market, "commit", "-q", "-m", "v1");
  const v1 = git(market, "rev-parse", "HEAD");
  write(market, "skills/demo/sample-alpha/workflow.md", "sample-alpha flow v2\n");
  write(market, "skills/demo/sample-beta/SKILL.md", skillText("sample-beta", "step one\nstep two"));
  write(market, "agents/opencode/sample-scout.md", agentText("provider/model-a", "Scout v2."));
  write(market, "registry.json", registry({ "sample-alpha": "1.1.0", "sample-beta": "1.1.0", "sample-gamma": "1.0.0", "sample-delta": "1.0.0" }));
  write(market, "agents/opencode/index.json", manifest({ "sample-helper": "0.1.0", "sample-scout": "0.2.0" }));
  git(market, "add", "-A");
  git(market, "commit", "-q", "-m", "v2");
  const v2 = git(market, "rev-parse", "HEAD");

  write(project, ".agents/skills/sample-alpha/SKILL.md", skillText("sample-alpha", "step one"));
  write(project, ".agents/skills/sample-alpha/workflow.md", "sample-alpha flow v2\n");
  write(project, ".agents/skills/sample-alpha/project.md", "testCommand: make test\n");
  write(project, ".agents/skills/sample-alpha/notes.local.md", "Personal notes.\n");
  write(project, ".agents/skills/sample-beta/SKILL.md", skillText("sample-beta", "step one"));
  write(project, ".agents/skills/sample-beta/workflow.md", "sample-beta flow v1\n");
  write(project, ".agents/skills/sample-gamma/SKILL.md", skillText("sample-gamma", "step one"));
  write(project, ".agents/skills/sample-gamma/workflow.md", "sample-gamma flow v1, edited\n");
  write(project, ".agents/skills/sample-gamma/config.local.json", "{}\n");
  write(project, ".agents/skills/sample-delta/SKILL.md", "Rewritten.\n");
  write(project, ".agents/skills/sample-delta/workflow.md", "Rewritten too.\n");
  write(project, ".claude/skills/sample-epsilon/SKILL.md", crlf(skillText("sample-epsilon", "epsilon", "3.0.0")));
  write(project, ".opencode/agents/sample-helper.md", crlf(agentText("provider/model-b", "Help.")));
  write(project, ".opencode/agents/sample-scout.md", agentText("provider/model-a", "Scout v1."));
  return { market, project, v1, v2 };
}

const EXPECTED = {
  "skill:sample-alpha": { state: "adapted", version: "1.1.0", base: "v2" },
  "skill:sample-beta": { state: "outdated", version: "1.0.0", base: "v1" },
  "skill:sample-gamma": { state: "modified", version: "1.0.0", base: "v1" },
  "skill:sample-delta": { state: "unknown-base", version: null, base: null },
  "skill:sample-epsilon": { state: "current", version: "3.0.0", base: "v1" },
  "agent:sample-helper": { state: "adapted", version: "0.1.0", base: "v1" },
  "agent:sample-scout": { state: "outdated", version: "0.1.0", base: "v1" },
};

test("the lock and the project scan agree on state, version and base for every installed copy", () => {
  const f = fixture();
  const lock = run(lockScript, ["init", "--project", f.project, "--marketplace", f.market, "--json"]);
  const scan = run(scanScript, ["status", "--project", f.project, "--marketplace", f.market, "--factory", path.join(f.market, "factory"), "--no-fetch", "--print"]);
  const commits = { v1: f.v1, v2: f.v2 };
  for (const [id, expected] of Object.entries(EXPECTED)) {
    const scanned = scan.artifacts.find((artifact) => artifact.id === id);
    const entry = lock[id];
    assert.ok(scanned, `${id} is scanned`);
    assert.ok(entry, `${id} is in the lock`);
    const scanView = { state: scanned.state, version: scanned.installed ?? null, base: scanned.base ?? null };
    const lockView = { state: entry.state, version: entry.version ?? null, base: entry.sourceCommit ?? null };
    assert.deepEqual(scanView, lockView, `${id}: the tools disagree`);
    assert.deepEqual(scanView, { ...expected, base: expected.base ? commits[expected.base] : null }, `${id}: unexpected result`);
    if (expected.state !== "modified") {
      assert.equal(entry.hash, scanned.contentHash, `${id}: one content hash format`);
    }
  }
  assert.equal(lock["skill:sample-epsilon"].location, ".claude/skills/sample-epsilon", "the lock covers every harness location");
  assert.equal(lock["skill:sample-delta"].nearestCommit.slice(0, 7), scan.artifacts.find((artifact) => artifact.id === "skill:sample-delta").nearestCommit);
});

test("a lock written by init reports no change in status for the same copies", () => {
  const f = fixture();
  run(lockScript, ["init", "--project", f.project, "--marketplace", f.market, "--json"]);
  const status = run(lockScript, ["status", "--project", f.project, "--marketplace", f.market, "--json"]);
  assert.deepEqual(status.changed.map((change) => change.artifact).sort(), ["skill:sample-delta", "skill:sample-gamma"], "only the copies without an exact base are changes");
  assert.deepEqual(status.missing, []);
  assert.deepEqual(status.untracked, []);
});

test("one adapter rule, one text normalization and one model line rule", () => {
  assert.equal(isAdapterFile("project.md"), true);
  assert.equal(isAdapterFile("config.local.json"), true);
  assert.equal(isAdapterFile("references/notes.local.md"), true);
  assert.equal(isAdapterFile("references/project.md"), false, "only the project.md at the skill root is the adapter");
  assert.equal(isAdapterFile("workflow.md"), false);
  assert.equal(portableText("skill", "a\r\nb\rc"), "a\nb\nc");
  assert.equal(portableText("agent", crlf("---\nmodel: x\nmode: all\n---\nmodel: kept in the body\n")), "---\nmode: all\n---\nmodel: kept in the body\n");
  assert.equal(modelLine("---\nmode: all\n---\nmodel: body\n"), null, "a model line outside the front matter is not the binding");
  assert.equal(modelLine(crlf("---\nmodel: provider/model-a\n---\n")), "model: provider/model-a");
});
