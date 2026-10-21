import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = path.resolve(scriptsDir, "..");
const scriptPath = path.join(marketplaceRoot, "plugins", "olko-sync", "skills", "olko-sync-state", "scripts", "sync-state.mjs");

function stateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "olko-sync-state-"));
}

function run(dir, ...args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args, "--state-dir", dir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function runJson(dir, ...args) {
  return JSON.parse(run(dir, ...args));
}

test("init creates every state file once without overwriting", () => {
  const dir = stateDir();
  run(dir, "init");
  for (const file of ["targets.json", "exclusions.json", "consolidation-rejections.json", "lineage.json"]) {
    assert.ok(fs.existsSync(path.join(dir, file)), file);
  }
  run(dir, "target", "set", "--name", "work", "--path", dir);
  run(dir, "init");
  assert.equal(runJson(dir, "target", "get").default, "work");
});

test("pinned exclusion applies to its scope only", () => {
  const dir = stateDir();
  run(dir, "exclusion", "add", "--artifact", "skill:olko-commit", "--scope", "olko->user", "--reason", "diverged on purpose");

  assert.equal(runJson(dir, "exclusion", "check", "--artifact", "skill:olko-commit", "--direction", "olko->user").status, "excluded");
  assert.equal(runJson(dir, "exclusion", "check", "--artifact", "skill:olko-commit", "--direction", "target->olko").status, "active");
});

test("rejected-new exclusion is version keyed", () => {
  const dir = stateDir();
  run(dir, "exclusion", "add", "--artifact", "agent:olko-helper", "--kind", "rejected-new", "--version", "1.2.0", "--reason", "not useful");

  assert.equal(runJson(dir, "exclusion", "check", "--artifact", "agent:olko-helper", "--direction", "olko->user", "--version", "1.2.0").status, "excluded");
  assert.equal(runJson(dir, "exclusion", "check", "--artifact", "agent:olko-helper", "--direction", "olko->user", "--version", "1.3.0").status, "active");
});

test("exclusion remove makes the artifact active again", () => {
  const dir = stateDir();
  run(dir, "exclusion", "add", "--artifact", "skill:caveman", "--reason", "vendored");
  run(dir, "exclusion", "remove", "--artifact", "skill:caveman");

  assert.equal(runJson(dir, "exclusion", "check", "--artifact", "skill:caveman", "--direction", "target->olko").status, "active");
});

test("consolidation rejection is suppressed for 30 days then due again", () => {
  const dir = stateDir();
  run(dir, "rejection", "add", "--items", "user:skill:b,user:skill:a", "--suggestion", "merge", "--now", "2026-10-20");

  const suppressed = runJson(dir, "rejection", "check", "--items", "user:skill:a,user:skill:b", "--now", "2026-11-18");
  assert.equal(suppressed.status, "suppressed");
  assert.equal(suppressed.lastRejectedAt, "2026-10-20");
  assert.equal(suppressed.askAgainAfter, "2026-11-19");
  assert.equal(runJson(dir, "rejection", "check", "--items", "user:skill:a,user:skill:b", "--now", "2026-11-19").status, "due");
  assert.equal(runJson(dir, "rejection", "list", "--due", "--now", "2026-11-19").length, 1);
});

test("rejection check uses the latest rejection date", () => {
  const dir = stateDir();
  run(dir, "rejection", "add", "--items", "a,b", "--suggestion", "merge", "--now", "2026-01-01");
  run(dir, "rejection", "add", "--items", "a,b", "--suggestion", "extend", "--now", "2026-03-01");

  assert.equal(runJson(dir, "rejection", "check", "--items", "a,b", "--now", "2026-03-15").status, "suppressed");
});

test("hash ignores line endings and changes with content", () => {
  const dir = stateDir();
  const skill = path.join(dir, "skill");
  fs.mkdirSync(skill);
  fs.writeFileSync(path.join(skill, "SKILL.md"), "a\nb\n");
  const first = run(dir, "hash", "--path", skill);
  fs.writeFileSync(path.join(skill, "SKILL.md"), "a\r\nb\r\n");
  assert.equal(run(dir, "hash", "--path", skill), first);
  fs.writeFileSync(path.join(skill, "SKILL.md"), "a\nc\n");
  assert.notEqual(run(dir, "hash", "--path", skill), first);
});

test("lineage records copies and canonical store", () => {
  const dir = stateDir();
  run(dir, "lineage", "set", "--capability", "pr-description", "--store", "target", "--path", "p/x", "--hash", "h1", "--canonical", "target");
  run(dir, "lineage", "set", "--capability", "pr-description", "--store", "olko", "--path", "skills/git/x", "--hash", "h2", "--ported-from", "target@h1");

  const record = runJson(dir, "lineage", "get", "--capability", "pr-description");
  assert.equal(record.canonical, "target");
  assert.equal(record.copies.olko.portedFrom, "target@h1");
});

test("rejects invalid artifact and direction values", () => {
  const dir = stateDir();
  const result = spawnSync(
    process.execPath,
    [scriptPath, "exclusion", "check", "--artifact", "skill:x", "--direction", "olko->nowhere", "--state-dir", dir],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Direction must be/);
});
