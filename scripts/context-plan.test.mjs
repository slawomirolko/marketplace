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
  writeSkill(repo, "git", "olko-commit", "Commit workflow orchestration.", true);
  writeSkill(repo, "testing", "olko-test", "Run affected tests.", true);
  fs.writeFileSync(
    path.join(repo, "registry.json"),
    JSON.stringify(
      {
        skills: [
          {
            name: "olko-commit",
            category: "git",
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

function primarySources(output) {
  return output.loadPlan.find((entry) => entry.role === "primary").sources;
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

test("includes existing project context files in the load plan output", () => {
  const repo = makeRepo();
  const contextRoot = path.join(repo, ".agents", "context");
  fs.mkdirSync(path.join(contextRoot, "summaries"), { recursive: true });
  fs.mkdirSync(path.join(contextRoot, "scratchpad"), { recursive: true });
  fs.mkdirSync(path.join(contextRoot, "memory"), { recursive: true });
  fs.writeFileSync(path.join(contextRoot, "summaries", "latest.md"), "decision: keep summary\n");
  fs.writeFileSync(path.join(contextRoot, "scratchpad", "current.json"), '{"task":"active"}\n');
  fs.writeFileSync(path.join(contextRoot, "memory", "olko-commit.md"), "memory: local preference\n");

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.projectContext, {
    summary: ".agents/context/summaries/latest.md",
    scratchpad: ".agents/context/scratchpad/current.json",
    skillMemory: ".agents/context/memory/olko-commit.md",
  });
});

test("handles missing project context gracefully", () => {
  const repo = makeRepo();

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.projectContext, {});
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

test("projectAdapter false disables adapter sources and uses", () => {
  const repo = makeRepo();
  const adapterDir = path.join(repo, ".agents", "skills", "olko-commit");
  fs.mkdirSync(path.join(repo, ".agents"), { recursive: true });
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(path.join(repo, ".agents", "skill-config.md"), "projectAdapter: false\n");
  fs.writeFileSync(
    path.join(adapterDir, "project.md"),
    ["uses: [olko-missing]", "contextSources: [ai/dotnet/ARCHITECTURE.md]", "ownedFiles: [ai/dotnet/ARCHITECTURE.md]", ""].join("\n"),
  );

  const result = runContextPlan(repo, ["--skill", "olko-commit"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.adaptation.projectAdapter, false);
  assert.deepEqual(output.adaptation.ownedFiles, []);
  assert.deepEqual(output.composition.dependencies, []);
  assert.equal(primarySources(output).some((source) => source.kind === "project-adapter"), false);
  assert.equal(primarySources(output).some((source) => source.kind === "project-adapter-source"), false);
});

test("loads adapter-declared project context sources before memory and summaries", () => {
  const repo = makeRepo();
  const adapterDir = path.join(repo, ".agents", "skills", "olko-commit");
  const contextRoot = path.join(repo, ".agents", "context");
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.mkdirSync(path.join(repo, "ai", "dotnet"), { recursive: true });
  fs.mkdirSync(path.join(contextRoot, "summaries"), { recursive: true });
  fs.writeFileSync(path.join(repo, "ai", "dotnet", "ARCHITECTURE.md"), "# Project architecture\n");
  fs.writeFileSync(path.join(contextRoot, "summaries", "latest.md"), "summary\n");
  fs.writeFileSync(
    path.join(adapterDir, "project.md"),
    ["contextSources:", "  - ai/dotnet/ARCHITECTURE.md", "ownedFiles:", "  - ai/dotnet/ARCHITECTURE.md", ""].join("\n"),
  );

  const result = runContextPlan(repo, ["--skill", "olko-commit"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.adaptation.ownedFiles, ["ai/dotnet/ARCHITECTURE.md"]);
  assert.deepEqual(
    primarySources(output)
      .filter((source) => ["project-adapter", "project-adapter-source", "project-summary"].includes(source.kind))
      .map((source) => [source.kind, source.source, source.score, source.budget]),
    [
      ["project-adapter", ".agents/skills/olko-commit/project.md", 95, 600],
      ["project-adapter-source", "ai/dotnet/ARCHITECTURE.md", 98, 1000],
      ["project-summary", ".agents/context/summaries/latest.md", 80, 800],
    ],
  );
});

test("emits deterministic source ordering for selected skill context", () => {
  const repo = makeRepo();
  const adapterDir = path.join(repo, ".agents", "skills", "olko-commit");
  const contextRoot = path.join(repo, ".agents", "context");
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.mkdirSync(path.join(repo, ".agents"), { recursive: true });
  fs.mkdirSync(path.join(contextRoot, "summaries"), { recursive: true });
  fs.mkdirSync(path.join(contextRoot, "memory"), { recursive: true });
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# Instructions\n");
  fs.writeFileSync(path.join(repo, ".agents", "skill-config.md"), "# Skill config\n");
  fs.writeFileSync(path.join(adapterDir, "project.md"), "uses: []\n");
  fs.writeFileSync(path.join(contextRoot, "memory", "olko-commit.md"), "memory\n");
  fs.writeFileSync(path.join(contextRoot, "summaries", "latest.md"), "summary\n");

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  const sources = primarySources(JSON.parse(result.stdout));
  assert.deepEqual(
    sources.map((source) => [source.kind, source.source]),
    [
      ["registry-metadata", "registry.json"],
      ["category-index", "skills/git/index.json"],
      ["route-candidates", "registry.json#skills"],
      ["skill-body", "skills/git/olko-commit/SKILL.md"],
      ["project-adapter", ".agents/skills/olko-commit/project.md"],
      ["skill-memory", ".agents/context/memory/olko-commit.md"],
      ["project-summary", ".agents/context/summaries/latest.md"],
      ["project-conventions", "AGENTS.md"],
      ["project-conventions", ".agents/skill-config.md"],
      ["skill-body", "skills/git/olko-commit/overview.md"],
      ["workflow", "skills/git/olko-commit/workflow.md"],
    ],
  );
});

test("emits source scoring and per-source budget metadata", () => {
  const repo = makeRepo();

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.sourceBudgets, {
    "registry-metadata": 300,
    "category-index": 300,
    "route-candidates": 300,
    "skill-body": 1200,
    "project-adapter": 600,
    "project-adapter-source": 1000,
    "skill-memory": 600,
    "project-summary": 800,
    "project-conventions": 600,
    workflow: 1200,
    example: 600,
    "edge-case": 400,
  });
  assert.deepEqual(
    primarySources(output).map(({ kind, score, budget }) => ({ kind, score, budget })),
    [
      { kind: "registry-metadata", score: 100, budget: 300 },
      { kind: "category-index", score: 100, budget: 300 },
      { kind: "route-candidates", score: 100, budget: 300 },
      { kind: "skill-body", score: 100, budget: 1200 },
      { kind: "skill-body", score: 100, budget: 1200 },
      { kind: "workflow", score: 70, budget: 1200 },
    ],
  );
});

test("excludes missing project convention files from source list", () => {
  const repo = makeRepo();

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    primarySources(JSON.parse(result.stdout)).filter((source) => source.kind === "project-conventions"),
    [],
  );
});

test("includes present AGENTS.md and skill-config project conventions", () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# Instructions\n");
  fs.writeFileSync(path.join(repo, ".agents", "skill-config.md"), "# Skill config\n");

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    primarySources(JSON.parse(result.stdout))
      .filter((source) => source.kind === "project-conventions")
      .map((source) => source.source),
    ["AGENTS.md", ".agents/skill-config.md"],
  );
});

test("excludes optional example and edge-case sources by default", () => {
  const repo = makeRepo();

  const result = runContextPlan(repo, ["--skill", "olko-commit", "--budget", "2000"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(primarySources(JSON.parse(result.stdout)).some((source) => source.kind === "example"), false);
  assert.equal(primarySources(JSON.parse(result.stdout)).some((source) => source.kind === "edge-case"), false);
});

test("includes optional example and edge-case sources when selected", () => {
  const repo = makeRepo();

  const result = runContextPlan(repo, [
    "--skill",
    "olko-commit",
    "--budget",
    "2000",
    "--include-examples",
    "--include-edge-cases",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    primarySources(JSON.parse(result.stdout))
      .filter((source) => ["example", "edge-case"].includes(source.kind))
      .map((source) => [source.kind, source.source, source.required]),
    [
      ["example", "skills/git/olko-commit/examples.md", false],
      ["edge-case", "skills/git/olko-commit/edge-cases.md", false],
    ],
  );
});
