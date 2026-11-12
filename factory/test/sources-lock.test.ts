import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildLock, staleWorkflows, updateMarketplace } from "../src/sources-lock.ts";
import { hostExec } from "../src/cli-backend.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function repo(): { origin: string; clone: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-lock-"));
  const origin = path.join(root, "origin");
  fs.mkdirSync(path.join(origin, "agents", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(origin, "agents", "opencode", "olko-a.md"), "---\nmode: primary\n---\nstep one\n");
  git(root, "init", "-q", "-b", "main", origin);
  git(origin, "-c", "user.name=t", "-c", "user.email=t@example.com", "add", ".");
  git(origin, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "a");
  const clone = path.join(root, "clone");
  execFileSync("git", ["clone", "-q", origin, clone]);
  return { origin, clone };
}

const spec = { name: "wf", version: "1", entry: "x", source: "agents/opencode/olko-a.md (steps 1-2)", nodes: [], edges: [] };

test("a workflow is stale after its source agent changes upstream and the marketplace is updated", async () => {
  const { origin, clone } = repo();
  const lock = buildLock([spec as never], clone);
  assert.deepEqual(staleWorkflows(lock, clone), []);
  fs.writeFileSync(path.join(origin, "agents", "opencode", "olko-a.md"), "---\nmode: primary\n---\nstep one\nstep two\n");
  git(origin, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-am", "b");
  const result = await updateMarketplace(hostExec, clone);
  assert.notEqual(result.before, result.after);
  assert.deepEqual(result.changedFiles, ["agents/opencode/olko-a.md"]);
  assert.deepEqual(staleWorkflows(lock, clone), [{ workflow: "wf", changed: ["agents/opencode/olko-a.md"], missing: [] }]);
});

test("update refuses a checkout that is not on main or has local changes, and pulls nothing", async () => {
  const { clone } = repo();
  const head = git(clone, "rev-parse", "HEAD");
  fs.appendFileSync(path.join(clone, "agents", "opencode", "olko-a.md"), "local edit\n");
  await assert.rejects(updateMarketplace(hostExec, clone), /uncommitted changes/);
  git(clone, "checkout", "-q", "--", ".");
  git(clone, "checkout", "-q", "-b", "feature");
  await assert.rejects(updateMarketplace(hostExec, clone), /not main/);
  assert.equal(git(clone, "rev-parse", "HEAD"), head);
});
