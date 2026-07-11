import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { planParallelWork } from "./skill-execution-plan.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const registryScriptPath = path.join(scriptsDir, "registry.mjs");
const executionPlanScriptPath = path.join(scriptsDir, "skill-execution-plan.mjs");

function writeSkill(repo, category, name, description, files = {}) {
  const skillDir = path.join(repo, "skills", category, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
  );
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(skillDir, file), content);
  }
}

function makeRepo(extraEntries = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-execution-plan-"));
  writeSkill(repo, "any", "olko-commit", "Commit workflow orchestration.");
  writeSkill(repo, "testing", "olko-test", "Run affected tests.", {
    "overview.md": "# Overview\n",
    "workflow.md": "# Workflow\n",
    "examples.md": ["# Dotnet Test Failure", "", "# Android Emulator", ""].join("\n"),
    "edge-cases.md": "# Edge cases\n",
  });
  fs.writeFileSync(
    path.join(repo, "registry.json"),
    JSON.stringify(
      {
        skills: [
          {
            name: "olko-commit",
            category: "any",
            files: ["SKILL.md"],
            ...(extraEntries["olko-commit"] ?? {}),
          },
          {
            name: "olko-test",
            category: "testing",
            files: ["SKILL.md", "overview.md", "workflow.md", "examples.md", "edge-cases.md"],
            ...(extraEntries["olko-test"] ?? {}),
          },
        ],
      },
      null,
      2,
    ),
  );
  assert.equal(spawnSync(process.execPath, [registryScriptPath, "--fix"], { cwd: repo }).status, 0);
  return repo;
}

function runExecutionPlan(repo, args) {
  return spawnSync(process.execPath, [executionPlanScriptPath, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

test("combines routing context examples compression files and parallel metadata", () => {
  const repo = makeRepo();

  const result = runExecutionPlan(repo, [
    "--intent",
    "dotnet test failure",
    "--project",
    repo,
    "--category",
    "testing",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.selectedPrimarySkill.name, "olko-test");
  assert.equal(output.selectedPrimarySkill.confidence, "high");
  assert.deepEqual(output.selectedExamples.map((example) => example.id), ["dotnet-test-failure"]);
  assert.equal(output.context.loadPlan[0].name, "olko-test");
  assert.match(output.compressionFiles.scratchpad, /\.agents\/context\/scratchpad\/current\.json$/);
  assert.equal(output.parallelWork.criticalPath, "route-skill");
});

test("reports requires entries that are not explicitly selected through uses", () => {
  const repo = makeRepo({
    "olko-commit": {
      requires: ["olko-test@1.0.0"],
    },
  });

  const result = runExecutionPlan(repo, ["--intent", "commit", "--project", repo, "--category", "any"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required skill is not selected via explicit uses: olko-test/);
});

test("accepts requires entries selected through explicit project adapter uses", () => {
  const repo = makeRepo({
    "olko-commit": {
      requires: ["olko-test@1.0.0"],
    },
  });
  const adapterDir = path.join(repo, ".agents", "skills", "olko-commit");
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(path.join(adapterDir, "project.md"), "uses: [olko-test]\n");

  const result = runExecutionPlan(repo, ["--intent", "commit", "--project", repo, "--category", "any"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.explicitUses.dependencies, [{ name: "olko-test", declaredBy: "olko-commit", depth: 1 }]);
});

test("projectAdapter false ignores declared uses in execution plan", () => {
  const repo = makeRepo({
    "olko-commit": {
      requires: ["olko-test@1.0.0"],
    },
  });
  const adapterDir = path.join(repo, ".agents", "skills", "olko-commit");
  fs.mkdirSync(path.join(repo, ".agents"), { recursive: true });
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(path.join(repo, ".agents", "skill-config.md"), "projectAdapter: false\n");
  fs.writeFileSync(path.join(adapterDir, "project.md"), "uses: [olko-test]\n");

  const result = runExecutionPlan(repo, ["--intent", "commit", "--project", repo, "--category", "any"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required skill is not selected via explicit uses: olko-test/);
});

test("parallel work planner rejects same-file write conflicts", () => {
  const parallelWork = planParallelWork([
    {
      id: "a",
      canRunInParallel: true,
      owns: ["scripts/route-skill.mjs"],
      blocks: [],
      blocksOn: [],
    },
    {
      id: "b",
      canRunInParallel: true,
      owns: ["scripts/route-skill.mjs"],
      blocks: [],
      blocksOn: [],
    },
  ]);

  assert.equal(parallelWork.allowed, false);
  assert.deepEqual(parallelWork.conflicts, [{ file: "scripts/route-skill.mjs", tasks: ["a", "b"] }]);
  assert.deepEqual(
    parallelWork.tasks.map((task) => [task.id, task.canRunInParallel]),
    [
      ["a", false],
      ["b", false],
    ],
  );
});
