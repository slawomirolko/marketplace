import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildWorktreeCommandPlan,
  createIsolatedProjectName,
  detectWorktree,
  discoverWorktreeScripts,
  runWorktreeComposeTests,
} from "./olko-test-worktree.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "olko-test-worktree-"));
  const tests = path.join(root, "scripts", "tests");
  fs.mkdirSync(tests, { recursive: true });
  for (const file of ["worktree-compose.ps1", "worktree-compose.api.ps1", "worktree-compose.db.ps1", "other.ps1"]) {
    fs.writeFileSync(path.join(tests, file), "# fixture\n");
  }
  return root;
}

test("detects linked worktrees but not the main checkout", () => {
  assert.equal(detectWorktree({ cwd: "C:/repo", gitDir: ".git/worktrees/feature", commonDir: ".git" }).isWorktree, true);
  assert.equal(detectWorktree({ cwd: "C:/repo", gitDir: ".git", commonDir: ".git" }).isWorktree, false);
});

test("discovers wrapper and matching scripts in deterministic order", () => {
  const root = fixture();
  const result = discoverWorktreeScripts(root);
  assert.match(result.wrapper, /worktree-compose\.ps1$/);
  assert.deepEqual(result.tests.map((file) => path.basename(file)), ["worktree-compose.api.ps1", "worktree-compose.db.ps1"]);
});

test("creates a shell-safe isolated project name", () => {
  const name = createIsolatedProjectName("C:/worktrees/Feature API_v2");
  assert.equal(name, "wt-feature-api-v2");
  assert.notEqual(name, "pricepredictor");
});

test("passes all worktree values and never targets the main project", () => {
  const plan = buildWorktreeCommandPlan({
    worktreePath: "C:/worktrees/feature",
    wrapper: "C:/worktrees/feature/scripts/tests/worktree-compose.ps1",
    tests: ["C:/worktrees/feature/scripts/tests/worktree-compose.api.ps1"],
    projectName: "wt-feature",
    mainProjectName: "pricepredictor",
    envFile: "C:/worktrees/feature/.env.test",
    portOffset: 17,
  });
  assert.equal(plan[0].env.COMPOSE_PROJECT_NAME, "wt-feature");
  assert.ok(plan[0].args.includes("C:/worktrees/feature"));
  assert.ok(plan[0].args.includes("wt-feature"));
  assert.ok(plan[0].args.includes("C:/worktrees/feature/.env.test"));
  assert.ok(plan[0].args.includes("17"));
  assert.equal(plan.at(-1).kind, "cleanup");
  assert.ok(plan.every((command) => !command.args.includes("pricepredictor")));
});

test("cleans up after success", async () => {
  const seen = [];
  const result = await runWorktreeComposeTests(
    buildWorktreeCommandPlan({ worktreePath: "C:/wt", wrapper: "wrapper.ps1", tests: [], projectName: "wt-x", mainProjectName: "main", envFile: "env", portOffset: 1 }),
    async (command) => { seen.push(command.kind); return { status: 0 }; },
  );
  assert.deepEqual(seen, ["start", "cleanup"]);
  assert.deepEqual(result, { status: 0, cleanupStatus: 0, failure: undefined });
});

test("preserves test failure while still cleaning up", async () => {
  const seen = [];
  const result = await runWorktreeComposeTests(
    buildWorktreeCommandPlan({ worktreePath: "C:/wt", wrapper: "wrapper.ps1", tests: ["test.ps1"], projectName: "wt-x", mainProjectName: "main", envFile: "env", portOffset: 1 }),
    async (command) => { seen.push(command.kind); return { status: command.kind === "test" ? 23 : 0 }; },
  );
  assert.deepEqual(seen, ["start", "test", "cleanup"]);
  assert.equal(result.status, 23);
  assert.equal(result.cleanupStatus, 0);
});

test("does not skip Docker/service failures", async () => {
  const result = await runWorktreeComposeTests(
    buildWorktreeCommandPlan({ worktreePath: "C:/wt", wrapper: "wrapper.ps1", tests: [], projectName: "wt-x", mainProjectName: "main", envFile: "env", portOffset: 1 }),
    async () => ({ status: 12 }),
  );
  assert.equal(result.status, 12);
  assert.equal(result.cleanupStatus, 12);
});

test("keeps the real test failure primary when cleanup fails", async () => {
  const seen = [];
  const result = await runWorktreeComposeTests(
    buildWorktreeCommandPlan({ worktreePath: "C:/wt", wrapper: "wrapper.ps1", tests: ["test.ps1"], projectName: "wt-x", mainProjectName: "main", envFile: "env", portOffset: 1 }),
    async (command) => {
      seen.push(command.kind);
      return { status: command.kind === "test" ? 23 : command.kind === "cleanup" ? 41 : 0 };
    },
  );
  assert.deepEqual(seen, ["start", "test", "cleanup"]);
  assert.equal(result.status, 23);
  assert.equal(result.cleanupStatus, 41);
});
