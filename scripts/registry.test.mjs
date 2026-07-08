import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "registry.mjs");

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-registry-"));
  const skillDir = path.join(repo, "skills", "any", "olko-demo");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(path.join(skillDir, "references"));
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: olko-demo",
      "description: Demo skill for registry validation.",
      "---",
      "",
      "# Demo",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(skillDir, "references", "guide.md"), "# Guide\n");
  fs.writeFileSync(
    path.join(repo, "registry.json"),
    JSON.stringify(
      {
        skills: [
          {
            name: "olko-demo",
            category: "any",
            files: ["SKILL.md"],
          },
        ],
      },
      null,
      2,
    ),
  );
  return repo;
}

function runRegistry(repo, args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repo,
    encoding: "utf8",
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("fix mode adds registry metadata and writes category indexes", () => {
  const repo = makeRepo();

  const result = runRegistry(repo, ["--fix"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /registry ok: 1 skills/);

  const registry = readJson(path.join(repo, "registry.json"));
  assert.equal(registry.registrySchemaVersion, 1);
  assert.equal(registry.skills[0].version, "1.0.0");
  assert.equal(registry.skills[0].description, "Demo skill for registry validation.");
  assert.deepEqual(registry.skills[0].tags, ["any", "demo"]);
  assert.deepEqual(registry.skills[0].capabilities, ["any", "any.demo"]);
  assert.equal(registry.skills[0].cost, 2);
  assert.deepEqual(registry.skills[0].files, ["SKILL.md", "references/guide.md"]);

  const categoryIndex = readJson(path.join(repo, "skills", "any", "index.json"));
  assert.deepEqual(categoryIndex, registry);
});

test("validation rejects runtime dependency fields in registry entries", () => {
  const repo = makeRepo();
  assert.equal(runRegistry(repo, ["--fix"]).status, 0);

  const registryPath = path.join(repo, "registry.json");
  const registry = readJson(registryPath);
  registry.skills[0].uses = ["olko-other"];
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const result = runRegistry(repo);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /olko-demo: uses must not be declared in registry entries/);
});

test("validation rejects stale category indexes", () => {
  const repo = makeRepo();
  assert.equal(runRegistry(repo, ["--fix"]).status, 0);

  const registryPath = path.join(repo, "registry.json");
  const registry = readJson(registryPath);
  registry.skills[0].description = "Changed after index generation.";
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const result = runRegistry(repo);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /skills\/any\/index\.json: category index is stale/);
});

test("validation rejects SKILL.md frontmatter name mismatches", () => {
  const repo = makeRepo();
  assert.equal(runRegistry(repo, ["--fix"]).status, 0);

  fs.writeFileSync(
    path.join(repo, "skills", "any", "olko-demo", "SKILL.md"),
    [
      "---",
      "name: olko-other",
      "description: Demo skill for registry validation.",
      "---",
      "",
      "# Demo",
      "",
    ].join("\n"),
  );

  const result = runRegistry(repo);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SKILL\.md frontmatter name must match registry name/);
});
