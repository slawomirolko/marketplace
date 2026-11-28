// Project change -> marketplace upstream flow.
//
// Part 1 ("current flow") pins down how installed artifacts behave today when a
// project edits them. These tests pass on main and must keep passing: the new
// flow adds detection next to the installers, it does not change them.
//
// Part 2 ("stage 1 flow") is the executable specification of stage 1: the
// lock, sanitize and plan scripts and the upstream agent. Change the test first
// when a contract changes.
//
// All fixture values are fictional. Never put a real company, product, or
// project name in this file.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = path.resolve(scriptsDir, "..");
const installAgents = path.join(scriptsDir, "install-opencode-agents.mjs");
const syncState = path.join(marketplaceRoot, "plugins", "olko-sync", "skills", "olko-sync-state", "scripts", "sync-state.mjs");
const lockScript = path.join(scriptsDir, "olko-marketplace-lock.mjs");
const sanitizeScript = path.join(scriptsDir, "olko-sanitize.mjs");
const planScript = path.join(scriptsDir, "olko-upstream-plan.mjs");
const upstreamAgent = path.join(marketplaceRoot, "agents", "opencode", "olko-marketplace-upstream.md");

const FICTIONAL_PROJECT = "billing-portal";
const FICTIONAL_ORG = "fictionalcorp";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `olko-upstream-${prefix}-`));
}

function node(script, args, cwd = marketplaceRoot, env = process.env) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env });
}

function git(cwd, ...args) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.autocrlf=false", ...args],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function skillHash(dir) {
  const stateDir = tmp("state");
  return node(syncState, ["hash", "--path", dir, "--state-dir", stateDir]).stdout.trim();
}

const skillV1 = {
  "SKILL.md": "---\nname: sample-skill\ndescription: Sample skill for tests.\nversion: 1.0.0\n---\n\n# sample-skill\n",
  "workflow.md": "# Workflow\n\n1. Read the input.\n2. Report the result.\n",
};
const skillV11 = {
  "SKILL.md": skillV1["SKILL.md"].replace("1.0.0", "1.1.0"),
  "workflow.md": `${skillV1["workflow.md"]}3. Stop.\n`,
};
const agentV1 = "---\ndescription: Sample agent for tests.\nmode: primary\nmodel: provider/model-a\n---\n\nDo the sample work.\n";

// Fictional marketplace: a git repo with sample-skill at 1.0.0, then 1.1.0, and one agent.
function fixtureMarketplace() {
  const root = tmp("marketplace");
  git(root, "init", "-q", "-b", "main");
  const skillDir = path.join(root, "skills", "marketplace", "sample-skill");
  const registry = (version) => JSON.stringify({ skills: [{ name: "sample-skill", category: "marketplace", version }] }, null, 2);
  for (const [file, content] of Object.entries(skillV1)) write(path.join(skillDir, file), content);
  write(path.join(root, "registry.json"), registry("1.0.0"));
  write(path.join(root, "agents", "opencode", "sample-agent.md"), agentV1);
  write(
    path.join(root, "agents", "opencode", "index.json"),
    JSON.stringify({ agents: [{ name: "sample-agent", file: "sample-agent.md", version: "1.0.0", skills: ["sample-skill"] }] }, null, 2),
  );
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "sample-skill 1.0.0");
  const v1 = git(root, "rev-parse", "HEAD");
  for (const [file, content] of Object.entries(skillV11)) write(path.join(skillDir, file), content);
  write(path.join(root, "registry.json"), registry("1.1.0"));
  git(root, "commit", "-q", "-am", "sample-skill 1.1.0");
  return { root, v1, v11: git(root, "rev-parse", "HEAD") };
}

// Fictional consuming project with sample-skill 1.0.0 installed and adapted.
function fixtureProject(files = skillV1) {
  const root = tmp("project");
  git(root, "init", "-q", "-b", "main");
  git(root, "remote", "add", "origin", `https://git.example.invalid/${FICTIONAL_ORG}/${FICTIONAL_PROJECT}.git`);
  write(path.join(root, "package.json"), JSON.stringify({ name: `@${FICTIONAL_ORG}/${FICTIONAL_PROJECT}` }));
  const skillDir = path.join(root, ".agents", "skills", "sample-skill");
  for (const [file, content] of Object.entries(files)) write(path.join(skillDir, file), content);
  write(path.join(skillDir, "project.md"), "# Project adapter\n\ntestCommand: make test\n");
  write(path.join(root, ".agents", "skill-config.md"), "projectAdapter: true\n");
  write(path.join(root, ".opencode", "agents", "sample-agent.md"), agentV1);
  return { root, skillDir };
}

// ---------------------------------------------------------------------------
// Part 1: current flow (passes on main)
// ---------------------------------------------------------------------------

test("current: installing an agent writes no provenance (no source commit, no installed hash)", () => {
  const project = tmp("install");
  const result = node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(project, ".agents", "marketplace.lock.json")), false);
  const head = git(marketplaceRoot, "rev-parse", "HEAD");
  const written = fs.readdirSync(project, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  for (const entry of written) {
    const content = fs.readFileSync(path.join(entry.parentPath ?? entry.path, entry.name), "utf8");
    assert.equal(content.includes(head), false, `${entry.name} unexpectedly records the source commit`);
  }
});

test("current: re-install without --force keeps a local skill edit and reports nothing about it", () => {
  const project = tmp("install");
  assert.equal(node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer"]).status, 0);
  const workflow = path.join(project, ".agents", "skills", "olko-agents-optimizer", "workflow.md");
  fs.appendFileSync(workflow, "\nLocal project rule.\n");

  const again = node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer"]);
  assert.equal(again.status, 0, again.stderr);
  const skillLines = again.stdout.split(/\r?\n/).filter((line) => line.includes("olko-agents-optimizer"));
  assert.deepEqual(skillLines, ["olko-skill-optimizer: skill olko-agents-optimizer present"]);
  assert.match(fs.readFileSync(workflow, "utf8"), /Local project rule\./);
});

test("current: re-install with --force drops a local skill edit without a warning", () => {
  const project = tmp("install");
  assert.equal(node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer"]).status, 0);
  const workflow = path.join(project, ".agents", "skills", "olko-agents-optimizer", "workflow.md");
  fs.appendFileSync(workflow, "\nLocal project rule.\n");

  const forced = node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer", "--force"]);
  assert.equal(forced.status, 0, forced.stderr);
  assert.match(forced.stdout, /skill olko-agents-optimizer installed/);
  assert.doesNotMatch(fs.readFileSync(workflow, "utf8"), /Local project rule\./);
});

test("current: a local agent edit blocks re-install, and --force overwrites it", () => {
  const project = tmp("install");
  assert.equal(node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer"]).status, 0);
  const agent = path.join(project, ".opencode", "agents", "olko-skill-optimizer.md");
  fs.appendFileSync(agent, "\nLocal agent rule.\n");

  const refused = node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer"]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Refusing to overwrite/);

  assert.equal(node(installAgents, ["--project", project, "--agent", "olko-skill-optimizer", "--force"]).status, 0);
  assert.doesNotMatch(fs.readFileSync(agent, "utf8"), /Local agent rule\./);
});

test("current: the sync-state content hash includes the project adapter, so it cannot tell adapter edits from skill edits", () => {
  const { skillDir } = fixtureProject();
  const before = skillHash(skillDir);
  fs.appendFileSync(path.join(skillDir, "project.md"), "lintCommand: make lint\n");
  assert.notEqual(skillHash(skillDir), before);
});

test("current: the sync-state content hash ignores line endings", () => {
  const { skillDir } = fixtureProject();
  const before = skillHash(skillDir);
  const workflow = path.join(skillDir, "workflow.md");
  fs.writeFileSync(workflow, fs.readFileSync(workflow, "utf8").replace(/\n/g, "\r\n"));
  assert.equal(skillHash(skillDir), before);
});

// ---------------------------------------------------------------------------
// Part 2: stage 1 flow (acceptance criteria)
// ---------------------------------------------------------------------------

function lock(project, marketplace, command, ...extra) {
  return node(lockScript, [command, "--project", project, "--marketplace", marketplace, "--json", ...extra]);
}

test("AC1: lock init finds the installed base version in marketplace history", () => {
  const market = fixtureMarketplace();
  const { root } = fixtureProject();
  const lockFile = json(lock(root, market.root, "init"));
  assert.equal(lockFile.schemaVersion, 1, "the lock format is versioned so later formats can migrate it");
  const entry = lockFile["skill:sample-skill"];
  assert.equal(entry.version, "1.0.0");
  assert.equal(entry.sourceCommit, market.v1);
  assert.match(entry.hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(entry.pending, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".agents", "marketplace.lock.json"), "utf8")), lockFile);
});

test("AC1: a copy that matches no marketplace version is flagged with an unknown base", () => {
  const market = fixtureMarketplace();
  const { root } = fixtureProject({ ...skillV1, "workflow.md": "# Workflow\n\nEdited before any lock existed.\n" });
  const entry = json(lock(root, market.root, "init"))["skill:sample-skill"];
  assert.equal(entry.base, "unknown");
  assert.equal(entry.nearestVersion, "1.0.0");
});

test("AC1: adapter-only edits keep status clean (project.md, skill-config.md, agent model)", () => {
  const market = fixtureMarketplace();
  const { root, skillDir } = fixtureProject();
  json(lock(root, market.root, "init"));
  fs.appendFileSync(path.join(skillDir, "project.md"), "lintCommand: make lint\n");
  fs.appendFileSync(path.join(root, ".agents", "skill-config.md"), "userResponseLanguage: pl\n");
  const agent = path.join(root, ".opencode", "agents", "sample-agent.md");
  fs.writeFileSync(agent, fs.readFileSync(agent, "utf8").replace("provider/model-a", "provider/model-b"));
  assert.deepEqual(json(lock(root, market.root, "status")).changed, []);
});

test("AC2: an edit to a portable skill file is reported with its base and files", () => {
  const market = fixtureMarketplace();
  const { root, skillDir } = fixtureProject();
  json(lock(root, market.root, "init"));
  fs.appendFileSync(path.join(skillDir, "workflow.md"), "3. Validate the input first.\n");
  const changed = json(lock(root, market.root, "status")).changed;
  assert.equal(changed.length, 1);
  assert.equal(changed[0].artifact, "skill:sample-skill");
  assert.equal(changed[0].base, "1.0.0");
  assert.deepEqual(changed[0].files, ["workflow.md"]);
  assert.equal(changed[0].upstreamMoved, true, "1.1.0 exists upstream, so the PR must be rebased on it");
});

// Sanitize exit codes: 0 clean, 2 blocked by a leak, 1 the script itself failed.
const SANITIZE_BLOCKED = 2;

/** Environment of a sanitize run: no leak terms from the caller's shell unless the test sets them. */
function sanitizeEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!("FACTORY_LEAK_TERMS" in extra)) {
    delete env.FACTORY_LEAK_TERMS;
  }
  return env;
}

function sanitize(stage, project, terms = ["placeholderterm"], { config = {}, env = {}, args = [] } = {}) {
  const termsFile = path.join(tmp("terms"), "terms.json");
  fs.writeFileSync(termsFile, JSON.stringify({ leakTerms: terms, ...config }));
  return node(sanitizeScript, ["--path", stage, "--project", project, "--terms-file", termsFile, "--json", ...args], marketplaceRoot, sanitizeEnv(env));
}

test("AC4: sanitize blocks names derived from the project and never prints them", () => {
  const { root } = fixtureProject();
  const stage = tmp("stage");
  write(path.join(stage, "workflow.md"), `# Workflow\n\nRun the ${FICTIONAL_PROJECT} smoke test.\n`);
  const result = sanitize(stage, root);
  assert.equal(result.status, SANITIZE_BLOCKED, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.clean, false);
  assert.deepEqual(report.hits.map((hit) => [hit.file, hit.line]), [["workflow.md", 3]]);
  assert.match(report.hits[0].term, /^#\d+$/);
  assert.equal(`${result.stdout}${result.stderr}`.toLowerCase().includes(FICTIONAL_PROJECT), false);
});

test("AC4: sanitize blocks configured leak terms and passes clean content", () => {
  const { root } = fixtureProject();
  const dirty = tmp("stage");
  write(path.join(dirty, "SKILL.md"), "Used by the zebraproject team.\n");
  assert.equal(sanitize(dirty, root, ["zebraproject"]).status, SANITIZE_BLOCKED);

  const clean = tmp("stage");
  write(path.join(clean, "workflow.md"), "# Workflow\n\n3. Validate the input first.\n");
  const result = sanitize(clean, root, ["zebraproject"]);
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), { clean: true, hits: [] });
});

test("forbidden terms stay out of the public repository", () => {
  const tracked = spawnSync("git", ["ls-files", "--", "scripts/forbidden-terms.json"], { cwd: marketplaceRoot, encoding: "utf8" });
  assert.equal(tracked.stdout.trim(), "", "forbidden terms belong in the private ~/.olko-sync/targets.json, not in the repository");
  assert.equal(fs.existsSync(path.join(scriptsDir, "forbidden-terms.json")), false);
});

test("sanitize blocks forbidden terms from the private config, also inside longer words", () => {
  const { root } = fixtureProject();
  const stage = tmp("stage");
  write(path.join(stage, "SKILL.md"), "Ask the quokkaware desk.\n");
  const result = sanitize(stage, root, [], { config: { forbiddenTerms: ["quokka"] } });
  assert.equal(result.status, SANITIZE_BLOCKED, result.stderr);
  assert.equal(`${result.stdout}${result.stderr}`.includes("quokka"), false);
});

test("sanitize blocks terms from FACTORY_LEAK_TERMS", () => {
  const { root } = fixtureProject();
  const stage = tmp("stage");
  write(path.join(stage, "SKILL.md"), "Owned by the wombat team.\n");
  const result = sanitize(stage, root, [], { env: { FACTORY_LEAK_TERMS: "narwhal, wombat" } });
  assert.equal(result.status, SANITIZE_BLOCKED, result.stderr);
  assert.equal(`${result.stdout}${result.stderr}`.includes("wombat"), false);
});

function plan({ stage, classification, openPrs = [], lockEntry = { version: "1.0.0", pending: null } }) {
  const dir = tmp("plan");
  const files = { classification, openPrs, lockEntry };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value));
  return node(planScript, [
    "--artifact", "skill:sample-skill",
    "--stage", stage,
    "--classification", path.join(dir, "classification.json"),
    "--open-prs", path.join(dir, "openPrs.json"),
    "--lock-entry", path.join(dir, "lockEntry.json"),
    "--json",
  ]);
}

function stagedChange() {
  const stage = tmp("stage");
  for (const [file, content] of Object.entries(skillV1)) write(path.join(stage, file), content);
  fs.appendFileSync(path.join(stage, "workflow.md"), "3. Validate the input first.\n");
  const classification = {
    hunks: [
      { file: "workflow.md", kind: "portable", text: "3. Validate the input first." },
      { file: "workflow.md", kind: "adapter", text: "testCommand: make ci-fast" },
    ],
  };
  return { stage, classification };
}

test("AC3+AC5: plan opens one draft PR per artifact, keeps adapter hunks local, names nothing", () => {
  const result = json(plan(stagedChange()));
  assert.equal(result.action, "open");
  assert.equal(result.draft, true);
  assert.match(result.branch, /^feature\/upstream-sample-skill-[0-9a-f]{8}$/);
  assert.ok(result.labels.includes("upstream-candidate"));
  assert.match(result.body, /1\.0\.0/);
  assert.deepEqual(result.localAdapter, [{ file: "workflow.md", text: "testCommand: make ci-fast" }]);
  const published = `${result.branch}\n${result.title}\n${result.body}`.toLowerCase();
  for (const forbidden of ["make ci-fast", FICTIONAL_PROJECT, FICTIONAL_ORG]) {
    assert.equal(published.includes(forbidden), false, `PR text contains a forbidden value (${forbidden.length} chars)`);
  }
});

test("AC6: plan skips a change that already has an open PR with the same content", () => {
  const change = stagedChange();
  const first = json(plan(change));
  const again = json(plan({ ...change, openPrs: [{ number: 7, branch: first.branch, contentHash: first.contentHash, base: "1.0.0" }] }));
  assert.equal(again.action, "skip");
  assert.equal(again.reason, "duplicate");
});

test("AC6: plan appends to the open PR on the same base and skips a rejected hash", () => {
  const change = stagedChange();
  const first = json(plan(change));
  const other = json(plan({ ...change, openPrs: [{ number: 7, branch: first.branch, contentHash: "0".repeat(64), base: "1.0.0" }] }));
  assert.equal(other.action, "append");
  assert.equal(other.pr, 7);

  const rejected = json(plan({ ...change, lockEntry: { version: "1.0.0", pending: null, rejected: [first.contentHash] } }));
  assert.equal(rejected.action, "skip");
  assert.equal(rejected.reason, "rejected");
});

test("AC6: plan opens a new PR when the open PR is on another base", () => {
  const change = stagedChange();
  const first = json(plan(change));
  const result = json(plan({ ...change, openPrs: [{ number: 7, branch: first.branch, contentHash: "0".repeat(64), base: "0.9.0" }] }));
  assert.equal(result.action, "open", "a change on 1.0.0 is never appended to a PR based on 0.9.0");
  assert.notEqual(result.branch, first.branch);
});

test("AC7: the upstream agent can open draft PRs but never merge, mark ready, request reviewers, or call the raw API", () => {
  const agent = fs.readFileSync(upstreamAgent, "utf8");
  assert.match(agent, /"gh pr create --draft\*": (allow|ask)/);
  for (const forbidden of ["gh pr merge*", "gh pr ready*", "gh pr edit*--add-reviewer*", "gh api*"]) {
    assert.match(agent, new RegExp(`"${forbidden.replace(/[*]/g, "\\*")}": deny`));
  }
});

test("AC6: lock record marks a content hash rejected or pending, and status reports both", () => {
  const market = fixtureMarketplace();
  const { root, skillDir } = fixtureProject();
  json(lock(root, market.root, "init"));
  fs.appendFileSync(path.join(skillDir, "workflow.md"), "3. Validate the input first.\n");
  const [changed] = json(lock(root, market.root, "status")).changed;
  assert.equal(changed.rejected, false);

  const record = (...args) => node(lockScript, ["record", "--project", root, "--artifact", "skill:sample-skill", "--json", ...args]);
  assert.equal(record("--rejected", "not-a-hash").status, 1, "a malformed hash is refused");
  json(record("--pending-pr", "7", "--content-hash", changed.contentHash));
  assert.deepEqual(json(lock(root, market.root, "status")).changed[0].pending, { pr: 7, contentHash: changed.contentHash });

  json(record("--rejected", changed.contentHash));
  const after = json(lock(root, market.root, "status")).changed[0];
  assert.equal(after.rejected, true);
  assert.equal(after.pending, null, "rejecting the pending content clears the pending PR");

  json(lock(root, market.root, "init"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".agents", "marketplace.lock.json"), "utf8"))["skill:sample-skill"].rejected, [changed.contentHash], "init keeps recorded decisions");
});

test("AC6: plan reads open PRs in gh's shape (headRefName and body)", () => {
  const change = stagedChange();
  const first = json(plan(change));
  const ghShape = [{ number: 9, headRefName: first.branch, body: first.body }];
  const again = json(plan({ ...change, openPrs: ghShape }));
  assert.equal(again.action, "skip");
  assert.equal(again.reason, "duplicate");
});

test("plan lists in the PR body only file names that exist in the stage directory", () => {
  const change = stagedChange();
  change.classification.hunks.push({ file: "../zebraproject-notes.md", kind: "portable", text: "3. Validate the input first." });
  const result = json(plan(change));
  assert.match(result.body, /Changed files: `workflow\.md`\n/);
  assert.equal(result.body.includes("zebraproject"), false);
});
