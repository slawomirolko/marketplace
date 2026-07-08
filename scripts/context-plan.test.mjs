import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const registryScriptPath = path.join(scriptsDir, "registry.mjs");
const contextPlanScriptPath = path.join(scriptsDir, "context-plan.mjs");

function writeSkill(repo, category, name, description, progressive = false) {
  const skillDir = path.join(repo, "skills", category, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
  );

  if (progressive) {
    for (const file of ["overview.md", "workflow.md", "examples.md", "edge-cases.md"]) {
      fs.writeFileSync(path.join(skillDir, file), `# ${file}\n`);
    }
  }
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-context-plan-"));
  writeSkill(repo, "any", "olko-commit", "Commit workflow orchestration.", true);
  writeSkill(repo, "testing", "olko-test", "Run affected tests.", true);
  fs.writeFileSync(
    path.join(repo, "registry.json"),
    JSON.stringify(
      {
        skills: [
          {
            name: "olko-commit",
            category: "any",
            files: ["SKILL.md"],
          },
          {
            name: "olko-test",
            category: "testing",
            files: ["SKILL.md"],
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

function runContextPlan(repo, args) {
  return spawnSync(process.execPath, [contextPlanScriptPath, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

test("creates a compressed context plan from explicit project adapter uses", () => {
  const repo = makeRepo();
  const adapterDir = path.join(repo, ".agents", "skills", "olko-commit");
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(path.join(adapterDir, "project.md"), ["uses:", "  - olko-test", ""].join("\n"));

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.phaseBudgets, {
    routing: 200,
    selection: 400,
    loading: 600,
    execution: 800,
  });
  assert.deepEqual(output.composition.dependencies, [{ name: "olko-test", declaredBy: "olko-commit", depth: 1 }]);
  assert.deepEqual(
    output.loadPlan.map((entry) => [entry.name, entry.role, entry.execution.load]),
    [
      ["olko-commit", "primary", ["SKILL.md", "overview.md", "workflow.md"]],
      ["olko-test", "support", ["overview.md"]],
    ],
  );
  assert.deepEqual(output.compression.dropUnlessDebugging, ["fullHistory", "fullToolLogs", "unusedCandidates"]);
});

test("rejects undeclared registry skills in project adapter uses", () => {
  const repo = makeRepo();
  const adapterDir = path.join(repo, ".agents", "skills", "olko-commit");
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(path.join(adapterDir, "project.md"), "uses: [olko-missing]\n");

  const result = runContextPlan(repo, ["--skill", "olko-commit"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /declared uses entry does not exist in registry: olko-missing/);
});
