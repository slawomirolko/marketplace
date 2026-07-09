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
  writeSkill(repo, "any", "olko-commit-docker", "Rebuild docker services after commit.");
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
            name: "olko-commit-docker",
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

  const result = runRoute(repo, ["--category", "testing", "--intent", "run test", "--limit", "2"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.category, "testing");
  assert.deepEqual(
    output.candidates.map((candidate) => candidate.name),
    ["olko-test"],
  );
  assert.equal(output.candidates[0].loading.first, "SKILL.md");
  assert.equal(output.candidates[0].confidence, "high");
  assert.deepEqual(output.candidates[0].reasons, [
    "tag match: test",
    "capability match: testing.test",
    "description match: run",
    "name match: olko-test",
  ]);
});

test("can suggest adjacent skills from the capability graph without loading them", () => {
  const repo = makeRepo();

  const result = runRoute(repo, ["--intent", "commit", "--limit", "2", "--suggest-adjacent"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const commit = output.candidates.find((candidate) => candidate.name === "olko-commit");
  assert.deepEqual(commit.adjacentSuggestions, [
    {
      skill: "olko-commit-docker",
      capability: "any.commit.docker",
      reason: "related to any",
    },
  ]);
});

test("rejects candidate limits outside the progressive routing range", () => {
  const repo = makeRepo();

  const result = runRoute(repo, ["--intent", "commit", "--limit", "8"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--limit must be an integer from 2 to 5/);
});

test("marks nearby alternatives as medium confidence", () => {
  const repo = makeRepo();

  const result = runRoute(repo, ["--intent", "commit", "--limit", "2"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.candidates[0].name, "olko-commit");
  assert.equal(output.candidates[0].confidence, "medium");
  assert.equal(output.candidates[1].name, "olko-commit-docker");
});

test("computes confidence before applying the candidate limit", () => {
  const repo = makeRepo();
  const registryPath = path.join(repo, "registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  registry.skills.push({
    name: "olko-commit-docs",
    category: "any",
    files: ["SKILL.md"],
  });
  writeSkill(repo, "any", "olko-commit-docs", "Check docs after commit.");
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  assert.equal(spawnSync(process.execPath, [registryScriptPath, "--fix"], { cwd: repo }).status, 0);

  const result = runRoute(repo, ["--intent", "commit", "--limit", "2"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.candidates[1].name, "olko-commit-docker");
  assert.equal(output.candidates[1].confidence, "medium");
});

test("only the top candidate can be high confidence", () => {
  const repo = makeRepo();

  const result = runRoute(repo, ["--intent", "commit", "--limit", "2"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.candidates[0].confidence, "medium");
  assert.equal(output.candidates[1].confidence, "medium");
});

test("excludes non-direct helper skills from routing", () => {
  const repo = makeRepo();
  const registryPath = path.join(repo, "registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  registry.skills.push({
    name: "caveman-commit",
    category: "any",
    origin: "vendored",
    version: "1.0.0",
    description: "Commit message format helper. Should not be called directly for commit.",
    tags: ["any", "caveman", "commit"],
    capabilities: ["any", "any.caveman.commit"],
    cost: 1,
    direct: false,
    files: ["SKILL.md"],
  });
  const skillDir = path.join(repo, "skills", "any", "caveman-commit");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: caveman-commit",
      "description: Commit message format helper.",
      "origin: vendored",
      "---",
      "",
      "# caveman-commit",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  assert.equal(spawnSync(process.execPath, [registryScriptPath, "--fix"], { cwd: repo }).status, 0);

  const result = runRoute(repo, ["--intent", "commit", "--limit", "5"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert(!output.candidates.some((candidate) => candidate.name === "caveman-commit"));
});
