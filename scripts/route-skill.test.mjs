import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const registryScriptPath = path.join(scriptsDir, "registry.mjs");
const routeScriptPath = path.join(scriptsDir, "route-skill.mjs");

function writeSkill(repo, category, name, description) {
  const skillDir = path.join(repo, "skills", category, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
  );
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-router-"));
  writeSkill(repo, "any", "olko-commit", "Commit workflow orchestration.");
  writeSkill(repo, "testing", "olko-test", "Run affected tests.");
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

function runRoute(repo, args) {
  return spawnSync(process.execPath, [routeScriptPath, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

test("routes through category index before ranking candidates", () => {
  const repo = makeRepo();

  const result = runRoute(repo, ["--category", "testing", "--intent", "run tests", "--limit", "2"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.category, "testing");
  assert.deepEqual(
    output.candidates.map((candidate) => candidate.name),
    ["olko-test"],
  );
  assert.equal(output.candidates[0].loading.first, "SKILL.md");
});

test("rejects candidate limits outside the progressive routing range", () => {
  const repo = makeRepo();

  const result = runRoute(repo, ["--intent", "commit", "--limit", "8"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--limit must be an integer from 2 to 5/);
});
