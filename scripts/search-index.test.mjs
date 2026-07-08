import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const registryScriptPath = path.join(scriptsDir, "registry.mjs");
const searchIndexScriptPath = path.join(scriptsDir, "search-index.mjs");

function writeSkill(repo, category, name, description) {
  const skillDir = path.join(repo, "skills", category, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
  );
}

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-search-index-"));
  writeSkill(repo, "testing", "olko-test", "Run affected tests.");
  fs.writeFileSync(
    path.join(repo, "registry.json"),
    JSON.stringify(
      {
        skills: [
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

test("registry fix generates local search index", () => {
  const repo = makeRepo();
  const index = JSON.parse(fs.readFileSync(path.join(repo, "search-index.json"), "utf8"));

  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.skills[0].tokens.slice(0, 5), ["olko", "test", "testing", "run", "affected"]);
});

test("search index script detects stale generated output", () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, "search-index.json"), '{"schemaVersion":1,"skills":[]}\n');

  const result = spawnSync(process.execPath, [searchIndexScriptPath], {
    cwd: repo,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /search-index.json: search index is stale/);
});
