import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = path.resolve(scriptsDir, "..");
const scriptPath = path.join(scriptsDir, "install-opencode-agents.mjs");

function run(project, ...args) {
  return spawnSync(process.execPath, [scriptPath, "--project", project, ...args], {
    cwd: marketplaceRoot,
    encoding: "utf8",
  });
}

test("installs the .NET audit agent with all its declared skills", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-dotnet-auditor");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent installed/);
  assert.match(result.stdout, /skill olko-dotnet-architecture installed/);
  assert.match(result.stdout, /skill olko-dotnet-style installed/);
  assert.match(result.stdout, /skill olko-dotnet-testing installed/);
  assert.match(result.stdout, /memory plugin opencode-agent-memory@0\.2\.0 enabled/);
  assert.match(result.stdout, /memory block olko-dotnet-auditor initialized/);
  assert.match(
    fs.readFileSync(path.join(project, ".opencode", "agents", "olko-dotnet-auditor.md"), "utf8"),
    /model: ollama-cloud\/deepseek-v4-flash:0731/,
  );
  const agent = fs.readFileSync(path.join(project, ".opencode", "agents", "olko-dotnet-auditor.md"), "utf8");
  assert.match(agent, /edit: allow/);
  assert.match(agent, /bash: deny/);
  assert.match(agent, /Do not execute tests, builds, or\s+formatters/);
  assert.match(agent, /`olko-dotnet-auditor` memory block/);
  const config = JSON.parse(fs.readFileSync(path.join(project, "opencode.json"), "utf8"));
  assert.deepEqual(config.plugin, ["opencode-agent-memory@0.2.0"]);
  assert.match(
    fs.readFileSync(path.join(project, ".opencode", "memory", "olko-dotnet-auditor.md"), "utf8"),
    /label: olko-dotnet-auditor/,
  );
  for (const skill of ["olko-dotnet-architecture", "olko-dotnet-style", "olko-dotnet-testing"]) {
    assert.ok(fs.existsSync(path.join(project, ".agents", "skills", skill, "SKILL.md")));
  }
});

test("installs the .NET audit agent by default", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-dotnet-auditor.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-dotnet-test-runner.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-implementation-orchestrator.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-marketplace-skill-sync-manager.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-marketplace-skill-sync-comparator.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-marketplace-skill-bootstrapper.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-test", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-implement-new", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-adapt-to-marketplace", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-commit", "SKILL.md")));
  for (const name of ["olko-dotnet-auditor", "olko-mobile-auditor", "olko-army-python-auditor"]) {
    assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", `${name}.md`)));
    assert.ok(fs.existsSync(path.join(project, ".opencode", "memory", `${name}.md`)));
  }
  for (const name of ["olko-dotnet-test-runner", "olko-mobile-test-runner", "olko-army-python-test-runner"]) {
    assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", `${name}.md`)));
  }
});

test("installs the .NET test runner without unrelated skills", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-dotnet-test-runner");

  assert.equal(result.status, 0, result.stderr);
  const agent = fs.readFileSync(path.join(project, ".opencode", "agents", "olko-dotnet-test-runner.md"), "utf8");
  assert.match(agent, /model: ollama-cloud\/deepseek-v4-flash:0731/);
  assert.match(agent, /edit: deny/);
  assert.match(agent, /bash:\s+"\*": allow/);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-test", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(project, ".agents", "skills", "olko-dotnet-architecture", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(project, "opencode.json")));
});

test("installs the .NET implementer with its review and verification skills", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-dotnet-implementer");

  assert.equal(result.status, 0, result.stderr);
  const agent = fs.readFileSync(path.join(project, ".opencode", "agents", "olko-dotnet-implementer.md"), "utf8");
  assert.match(agent, /edit: allow/);
  assert.match(agent, /bash:\s+"\*": allow/);
  assert.match(agent, /"git commit \*": deny/);
  assert.match(agent, /"git push \*": deny/);
  assert.match(agent, /task: deny/);
  assert.match(agent, /Do not commit, push/);
  for (const skill of ["olko-dotnet-architecture", "olko-dotnet-style", "olko-dotnet-testing", "olko-test"]) {
    assert.ok(fs.existsSync(path.join(project, ".agents", "skills", skill, "SKILL.md")));
  }
  assert.ok(!fs.existsSync(path.join(project, ".opencode", "memory", "olko-dotnet-implementer.md")));
});

test("installs the implementation orchestrator with delegation-only permissions", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-implementation-orchestrator");

  assert.equal(result.status, 0, result.stderr);
  const agent = fs.readFileSync(
    path.join(project, ".opencode", "agents", "olko-implementation-orchestrator.md"),
    "utf8",
  );
  assert.match(agent, /edit: allow/);
  assert.match(agent, /bash: allow/);
  assert.match(agent, /task:\s+"\*": deny/);
  assert.match(agent, /olko-worktree-lifecycle-manager: allow/);
  assert.match(agent, /olko-git-delivery-manager: allow/);
  assert.match(agent, /Do not load or follow `olko-implement-new`/);
  assert.match(agent, /Own implementation tracking in the canonical technical plan/);
  assert.match(agent, /## Implementation/);
  assert.match(agent, /Never dispatch two editing agents for the same file/);
  for (const child of [
    "olko-marketplace-skill-bootstrapper",
    "olko-dotnet-auditor",
    "olko-dotnet-implementer",
    "olko-dotnet-test-runner",
    "olko-mobile-auditor",
    "olko-mobile-implementer",
    "olko-mobile-test-runner",
    "olko-army-python-auditor",
    "olko-army-python-implementer",
    "olko-army-python-test-runner",
  ]) {
    assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", `${child}.md`)));
  }
  assert.doesNotMatch(agent, /olko-implement-new: allow/);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-implement-new", "SKILL.md")));
  const config = JSON.parse(fs.readFileSync(path.join(project, "opencode.json"), "utf8"));
  assert.deepEqual(config.plugin, ["opencode-agent-memory@0.2.0"]);
});

test("installs the plan documentation orchestrator with review-only stack delegates", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-plan-documentation-orchestrator");

  assert.equal(result.status, 0, result.stderr);
  const agent = fs.readFileSync(
    path.join(project, ".opencode", "agents", "olko-plan-documentation-orchestrator.md"),
    "utf8",
  );
  assert.match(agent, /mode: primary/);
  assert.doesNotMatch(agent, /hidden: true/);
  assert.match(agent, /edit: allow/);
  assert.match(agent, /bash: deny/);
  assert.match(agent, /olko-dotnet-auditor: allow/);
  assert.match(agent, /olko-mobile-auditor: allow/);
  assert.match(agent, /olko-army-python-auditor: allow/);
  assert.match(agent, /olko-investigation-readiness-worker: allow/);
  assert.match(agent, /instruction to review only/);
  assert.match(agent, /consistency gate immediately after every invocation/);
  assert.match(agent, /Implementation readiness/);
  assert.match(agent, /Every business purpose, mechanism, scope boundary, non-goal, risk, and/);
  assert.match(agent, /olko-plan-editor: allow/);
  assert.match(agent, /olko-investigate-existing: allow/);
  assert.match(agent, /grill-with-docs: allow/);
  assert.match(agent, /Load `grill-with-docs` through the `skill` tool/);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-plan-editor", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-investigate-existing", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "grill-with-docs", "SKILL.md")));
  for (const [agentName, skills] of [
    ["olko-dotnet-auditor", ["olko-dotnet-architecture", "olko-dotnet-style"]],
    ["olko-mobile-auditor", ["olko-kotlin-architecture", "olko-kotlin-style"]],
    ["olko-army-python-auditor", ["olko-python-architecture", "olko-python-style"]],
    ["olko-investigation-readiness-worker", ["olko-investigate-existing"]],
  ]) {
    assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", `${agentName}.md`)));
    for (const skill of skills) {
      assert.ok(fs.existsSync(path.join(project, ".agents", "skills", skill, "SKILL.md")));
    }
  }
  const config = JSON.parse(fs.readFileSync(path.join(project, "opencode.json"), "utf8"));
  assert.deepEqual(config.plugin, ["opencode-agent-memory@0.2.0"]);
});

test("installs the visible marketplace skill sync manager and its comparator", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const managerResult = run(project, "--agent", "olko-marketplace-skill-sync-manager");

  assert.equal(managerResult.status, 0, managerResult.stderr);
  const manager = fs.readFileSync(
    path.join(project, ".opencode", "agents", "olko-marketplace-skill-sync-manager.md"),
    "utf8",
  );
  assert.match(manager, /mode: primary/);
  assert.doesNotMatch(manager, /hidden: true/);
  assert.match(manager, /task:\s+"\*": deny/);
  assert.match(manager, /external_directory: allow/);
  assert.match(manager, /olko-adapt-to-marketplace: allow/);
  assert.match(manager, /olko-commit: allow/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(marketplaceRoot, "agents", "opencode", "index.json"), "utf8")).agents.find(
      (agent) => agent.name === "olko-marketplace-skill-sync-manager",
    ).version,
    "2.1.0",
  );
  assert.match(manager, /bash: allow/);
  assert.match(manager, /Never pass `--force` to `olko-commit`/);
  assert.match(manager, /scope-named feature branch and PR flow/);
  assert.match(manager, /Squash merge only after the user/);
  assert.match(manager, /skills and\s+OpenCode agents/);
  assert.match(manager, /agents\/opencode\/index\.json/);
  assert.match(manager, /including the approved SemVer version/);
  assert.match(manager, /RECURRING-LEARNING LAYER/);
  assert.match(manager, /Rejected candidate/);
  assert.match(manager, /never ask again for that same version/);
  assert.match(manager, /whether it should be created in the marketplace/);
  assert.match(manager, /olko-marketplace-skill-sync-manager.*block/);
  assert.match(manager, /install-opencode-agents\.mjs --project/);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-adapt-to-marketplace", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-commit", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-marketplace-skill-bootstrapper.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "agents", "olko-marketplace-skill-sync-comparator.md")));
  assert.match(
    fs.readFileSync(path.join(project, ".opencode", "memory", "olko-marketplace-skill-sync-manager.md"), "utf8"),
    /version-keyed rejected new-artifact candidates/,
  );

  const comparatorResult = run(project, "--agent", "olko-marketplace-skill-sync-comparator");

  assert.equal(comparatorResult.status, 0, comparatorResult.stderr);
  const comparator = fs.readFileSync(
    path.join(project, ".opencode", "agents", "olko-marketplace-skill-sync-comparator.md"),
    "utf8",
  );
  assert.match(comparator, /edit: deny/);
  assert.match(comparator, /task: deny/);
  assert.match(comparator, /external_directory: allow/);
  assert.match(comparator, /artifact specified by the calling manager/);
  assert.match(comparator, /marketplace agent\s+manifest entry/);
});

test("declares a valid SemVer version for every OpenCode agent", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(marketplaceRoot, "agents", "opencode", "index.json"), "utf8"),
  );
  const semVer = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

  for (const agent of manifest.agents) {
    assert.match(agent.version, semVer, `${agent.name} must declare a valid SemVer version`);
  }
});

test("installs the hidden marketplace skill bootstrapper", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-marketplace-skill-bootstrapper");

  assert.equal(result.status, 0, result.stderr);
  const agent = fs.readFileSync(
    path.join(project, ".opencode", "agents", "olko-marketplace-skill-bootstrapper.md"),
    "utf8",
  );
  assert.match(agent, /hidden: true/);
  assert.match(agent, /edit: deny/);
  assert.match(agent, /task: deny/);
  assert.match(agent, /olko-install-skill: allow/);
  assert.match(agent, /npm's global root/);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-install-skill", "SKILL.md")));
});

for (const [agentName, skills] of [
  ["olko-mobile-implementer", ["olko-kotlin-architecture", "olko-kotlin-style", "olko-kotlin-testing", "olko-test"]],
  ["olko-army-python-implementer", ["olko-python-architecture", "olko-python-style", "olko-python-testing", "olko-test"]],
]) {
  test(`installs ${agentName} with its declared skills`, () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
    const result = run(project, "--agent", agentName);

    assert.equal(result.status, 0, result.stderr);
    for (const skill of skills) {
      assert.ok(fs.existsSync(path.join(project, ".agents", "skills", skill, "SKILL.md")));
    }
  });
}

test("installs the mobile auditor with only Kotlin skills", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-mobile-auditor");

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-kotlin-architecture", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(project, ".agents", "skills", "olko-python-architecture", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(project, ".opencode", "memory", "olko-mobile-auditor.md")));
});

test("installs the Python Army test runner with only olko-test", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "olko-army-python-test-runner");

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(project, ".agents", "skills", "olko-test", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(project, ".agents", "skills", "olko-python-testing", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(project, "opencode.json")));
});

test("rejects an unknown OpenCode agent", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-opencode-agent-"));
  const result = run(project, "--agent", "unknown-agent");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown OpenCode agent: unknown-agent/);
});
