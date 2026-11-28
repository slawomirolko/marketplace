import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { apply, prepare, summary } from "./olko-marketplace-merge.mjs";
import { status as lockStatus } from "./olko-marketplace-lock.mjs";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "olko-marketplace-merge.mjs");
const SKILL_DIR = ".agents/skills/sample-skill";
const AGENT_FILE = ".opencode/agents/sample-agent.md";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.autocrlf=false", ...args], { encoding: "utf8" }).trim();
}

function write(root, relativePath, text) {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), text);
}

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const skillFile = (version, step) => `---\nname: sample-skill\nversion: ${version}\ndescription: x\n---\n# Sample\n${step}\n`;
const WORKFLOW_V1 = "flow one\nflow two\nflow three\n";
const agentFile = (model, body) => `---\ndescription: a\nmode: primary\nmodel: ${model}\n---\n${body}\n`;
const AGENT_V1 = agentFile("provider/a", "line one\nline two\nline three");
const AGENT_V2 = agentFile("provider/a", "line one\nline two\nline three\nline four");

/** A marketplace with two commits: v1, then `changeV2`; defaults to a SKILL.md edit and an agent body edit. */
function fixture({ changeV2 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-merge-test-"));
  const market = path.join(root, "market");
  write(market, "skills/demo/sample-skill/SKILL.md", skillFile("1.0.0", "step one"));
  write(market, "skills/demo/sample-skill/workflow.md", WORKFLOW_V1);
  write(market, "skills/demo/sample-other/SKILL.md", "---\nname: sample-other\n---\nother\n");
  write(market, "agents/opencode/sample-agent.md", AGENT_V1);
  git(root, "init", "-q", "-b", "main", market);
  git(market, "add", ".");
  git(market, "commit", "-q", "-m", "v1");
  const v1 = git(market, "rev-parse", "HEAD");
  const edit =
    changeV2 ??
    ((dir) => {
      write(dir, "skills/demo/sample-skill/SKILL.md", skillFile("1.1.0", "step one\nstep two"));
      write(dir, "agents/opencode/sample-agent.md", AGENT_V2);
    });
  edit(market);
  git(market, "add", "-A");
  git(market, "commit", "-q", "-m", "v2");
  const project = path.join(root, "sample-app");
  fs.mkdirSync(project);
  const out = path.join(root, "out");
  return { root, market, project, v1, v2: git(market, "rev-parse", "HEAD"), out };
}

function installV1Skill(f, dir = SKILL_DIR, { workflow = WORKFLOW_V1, crlf = false } = {}) {
  const lineEndings = (text) => (crlf ? text.replace(/\n/g, "\r\n") : text);
  write(f.project, `${dir}/SKILL.md`, lineEndings(skillFile("1.0.0", "step one")));
  write(f.project, `${dir}/workflow.md`, lineEndings(workflow));
}

function run(f, options = {}) {
  return prepare({ project: f.project, marketplace: f.market, out: f.out, fetch: false, ...options });
}

function itemOf(plan, id) {
  return plan.items.find((item) => item.id === id);
}

test("outdated takes the upstream copy and keeps the adapter", () => {
  const f = fixture();
  installV1Skill(f);
  write(f.project, `${SKILL_DIR}/project.md`, "lintCommand: make lint\n");
  const plan = run(f);
  const item = itemOf(plan, "skill:sample-skill");
  assert.equal(item.state, "outdated");
  assert.equal(item.baseGuessed, false);
  assert.deepEqual(item.locations, [SKILL_DIR]);
  assert.deepEqual(item.versions, { local: "1.0.0", upstream: "1.1.0", localCommit: f.v1, upstreamCommit: f.v2 });
  assert.deepEqual(item.files, [{ path: "SKILL.md", result: "upstream" }]);
  assert.equal(read(item.dir, "SKILL.md"), skillFile("1.1.0", "step one\nstep two"));
  assert.equal(read(item.dir, "workflow.md"), WORKFLOW_V1);
  assert.equal(fs.existsSync(path.join(item.dir, "project.md")), false);
  assert.equal(plan.head, f.v2);
  assert.equal(plan.ref, "HEAD");
  assert.deepEqual(plan.ids, ["skill:sample-skill"]);
  assert.deepEqual(JSON.parse(read(f.out, "plan.json")), plan);
});

test("modified with upstream moved merges both sides cleanly", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  const plan = run(f);
  const item = itemOf(plan, "skill:sample-skill");
  assert.equal(item.state, "modified");
  assert.equal(plan.conflicts, 0);
  assert.deepEqual(item.files, [
    { path: "SKILL.md", result: "upstream" },
    { path: "workflow.md", result: "local" },
  ]);
  assert.equal(read(item.dir, "SKILL.md"), skillFile("1.1.0", "step one\nstep two"));
  assert.equal(read(item.dir, "workflow.md"), "flow ONE\nflow two\nflow three\n");
});

test("both sides editing different lines of one file merge into a clean file", () => {
  const f = fixture({
    changeV2: (dir) => write(dir, "skills/demo/sample-skill/workflow.md", "flow one\nflow two\nflow THREE\n"),
  });
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  const plan = run(f);
  const item = itemOf(plan, "skill:sample-skill");
  assert.deepEqual(item.files, [{ path: "workflow.md", result: "clean" }]);
  assert.equal(read(item.dir, "workflow.md"), "flow ONE\nflow two\nflow THREE\n");
});

test("overlapping edits are a conflict with markers", () => {
  const f = fixture({
    changeV2: (dir) => {
      write(dir, "skills/demo/sample-skill/SKILL.md", skillFile("1.1.0", "step one\nstep two"));
      write(dir, "skills/demo/sample-skill/workflow.md", "flow UPSTREAM\nflow two\nflow three\n");
    },
  });
  installV1Skill(f, SKILL_DIR, { workflow: "flow LOCAL\nflow two\nflow three\n" });
  const plan = run(f);
  const item = itemOf(plan, "skill:sample-skill");
  const conflicted = item.files.find((file) => file.result === "conflict");
  assert.equal(conflicted.path, "workflow.md");
  assert.equal(conflicted.conflictKind, "both-edited");
  assert.match(read(item.dir, "workflow.md"), /<<<<<<< local/);
  assert.match(read(item.dir, "workflow.md"), />>>>>>> upstream/);
  assert.equal(plan.conflicts, 1);
});

test("deleted upstream and edited locally is a conflict", () => {
  const f = fixture({
    changeV2: (dir) => fs.rmSync(path.join(dir, "skills/demo/sample-skill/workflow.md")),
  });
  installV1Skill(f, SKILL_DIR, { workflow: "flow LOCAL\nflow two\nflow three\n" });
  const plan = run(f);
  const item = itemOf(plan, "skill:sample-skill");
  assert.deepEqual(item.files, [{ path: "workflow.md", result: "conflict", conflictKind: "deleted-upstream" }]);
  assert.equal(plan.conflicts, 1);
});

test("deleted locally and edited upstream is a conflict", () => {
  const f = fixture({
    changeV2: (dir) => {
      write(dir, "skills/demo/sample-skill/SKILL.md", skillFile("1.1.0", "step one\nstep two"));
      write(dir, "skills/demo/sample-skill/workflow.md", "flow UPSTREAM\nflow two\nflow three\n");
    },
  });
  write(f.project, `${SKILL_DIR}/SKILL.md`, skillFile("1.0.0", "step one"));
  const plan = run(f);
  const item = itemOf(plan, "skill:sample-skill");
  assert.deepEqual(item.files, [
    { path: "SKILL.md", result: "upstream" },
    { path: "workflow.md", result: "conflict", conflictKind: "deleted-locally" },
  ]);
});

test("a file deleted upstream and untouched locally is removed from the result", () => {
  const f = fixture({
    changeV2: (dir) => fs.rmSync(path.join(dir, "skills/demo/sample-skill/workflow.md")),
  });
  installV1Skill(f);
  const item = itemOf(run(f), "skill:sample-skill");
  assert.deepEqual(item.files, [{ path: "workflow.md", result: "upstream" }]);
  assert.equal(fs.existsSync(path.join(item.dir, "workflow.md")), false);
});

test("CRLF project copy merges like LF", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n", crlf: true });
  const plan = run(f);
  const item = itemOf(plan, "skill:sample-skill");
  assert.equal(plan.conflicts, 0);
  assert.equal(read(item.dir, "workflow.md"), "flow ONE\nflow two\nflow three\n");
  assert.equal(read(item.dir, "SKILL.md"), skillFile("1.1.0", "step one\nstep two"));
});

test("agent keeps the project model line", () => {
  const f = fixture();
  write(f.project, AGENT_FILE, agentFile("provider/project", "line one\nline two\nline three"));
  const plan = run(f);
  const item = itemOf(plan, "agent:sample-agent");
  assert.equal(item.kind, "agent");
  assert.deepEqual(item.locations, [AGENT_FILE]);
  const merged = read(item.dir, "sample-agent.md");
  assert.match(merged, /^model: provider\/project$/m);
  assert.doesNotMatch(merged, /provider\/a/);
  assert.match(merged, /line four/);
});

test("lock sourceCommit is the base; without a lock the base is guessed", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  const guessed = itemOf(run(f), "skill:sample-skill");
  assert.equal(guessed.baseGuessed, true);
  assert.equal(guessed.base, f.v1);
  write(f.project, ".agents/marketplace.lock.json", JSON.stringify({ schemaVersion: 1, "skill:sample-skill": { kind: "skill", source: "skills/demo/sample-skill", location: SKILL_DIR, sourceCommit: f.v1 } }));
  const locked = itemOf(run(f), "skill:sample-skill");
  assert.equal(locked.baseGuessed, false);
  assert.equal(locked.base, f.v1);
});

test("a lock commit the marketplace does not have falls back to the guessed base", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  write(f.project, ".agents/marketplace.lock.json", JSON.stringify({ schemaVersion: 1, "skill:sample-skill": { kind: "skill", source: "skills/demo/sample-skill", location: SKILL_DIR, sourceCommit: "0".repeat(40) } }));
  const item = itemOf(run(f), "skill:sample-skill");
  assert.equal(item.baseGuessed, true);
  assert.equal(item.base, f.v1);
});

test("identical copies give one item with two locations; different copies give one item each", () => {
  const f = fixture();
  installV1Skill(f);
  installV1Skill(f, ".claude/skills/sample-skill");
  const together = run(f);
  assert.equal(together.items.filter((item) => item.name === "sample-skill").length, 1);
  assert.deepEqual(itemOf(together, "skill:sample-skill").locations, [SKILL_DIR, ".claude/skills/sample-skill"]);
  write(f.project, ".claude/skills/sample-skill/workflow.md", "flow ONE\nflow two\nflow three\n");
  const apart = run(f);
  assert.deepEqual(apart.ids.filter((id) => id.includes("sample-skill")), [`skill:sample-skill@${SKILL_DIR}`, "skill:sample-skill@.claude/skills/sample-skill"]);
  assert.deepEqual(itemOf(apart, `skill:sample-skill@${SKILL_DIR}`).locations, [SKILL_DIR]);
  assert.notEqual(itemOf(apart, `skill:sample-skill@${SKILL_DIR}`).dir, itemOf(apart, "skill:sample-skill@.claude/skills/sample-skill").dir);
});

test("source harness, unknown-base, current and modified without upstream move are left out", () => {
  const f = fixture();
  write(f.project, ".agents/skills/sample-other/SKILL.md", "---\nname: sample-other\n---\ntotally different\n");
  write(f.project, AGENT_FILE, AGENT_V2);
  write(f.project, `${SKILL_DIR}/SKILL.md`, skillFile("1.1.0", "step one\nstep two\nlocal edit"));
  write(f.project, `${SKILL_DIR}/workflow.md`, WORKFLOW_V1);
  assert.deepEqual(run(f).items, []);

  const checkout = path.join(f.root, "checkout");
  git(f.root, "clone", "-q", f.market, checkout);
  git(checkout, "checkout", "-q", f.v1);
  write(checkout, "registry.json", `{"skills":[]}\n`);
  const plan = prepare({ project: checkout, marketplace: f.market, out: path.join(f.root, "out-source"), fetch: false });
  assert.deepEqual(plan.items, []);
});

test("prepare writes nothing in the project or the marketplace", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  write(f.project, AGENT_FILE, agentFile("provider/project", "line one\nline two\nline three"));
  git(f.project, "init", "-q", "-b", "main");
  git(f.project, "add", ".");
  git(f.project, "commit", "-q", "-m", "init");
  const before = [git(f.project, "status", "--porcelain"), git(f.market, "status", "--porcelain"), git(f.project, "rev-parse", "HEAD"), git(f.market, "rev-parse", "HEAD")];
  const filesBefore = fs.readdirSync(f.project, { recursive: true }).sort();
  run(f);
  const after = [git(f.project, "status", "--porcelain"), git(f.market, "status", "--porcelain"), git(f.project, "rev-parse", "HEAD"), git(f.market, "rev-parse", "HEAD")];
  assert.deepEqual(after, before);
  assert.deepEqual(fs.readdirSync(f.project, { recursive: true }).sort(), filesBefore);
  assert.equal(git(f.project, "status", "--porcelain"), "");
  assert.equal(git(f.market, "status", "--porcelain"), "");
});

test("the CLI prints the plan as JSON and writes plan.json", () => {
  const f = fixture();
  installV1Skill(f);
  const result = spawnSync(process.execPath, [scriptPath, "prepare", "--project", f.project, "--marketplace", f.market, "--out", f.out, "--no-fetch", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.ids, ["skill:sample-skill"]);
  assert.deepEqual(JSON.parse(read(f.out, "plan.json")), plan);
});

test("the CLI refuses a missing flag and an unknown command", () => {
  const missing = spawnSync(process.execPath, [scriptPath, "prepare", "--project", "x"], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--marketplace/);
  const unknown = spawnSync(process.execPath, [scriptPath, "frobnicate"], { encoding: "utf8" });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown command/);
});

test("agent model line stays at its line position in the front matter", () => {
  const withMiddleModel = (model, body) => `---\ndescription: a\nmodel: ${model}\nmode: primary\n---\n${body}\n`;
  const f = fixture({
    changeV2: (dir) => write(dir, "agents/opencode/sample-agent.md", withMiddleModel("provider/a", "line one\nline two\nline three\nline four")),
  });
  write(f.project, AGENT_FILE, withMiddleModel("provider/project", "line one\nline two\nline three"));
  const item = itemOf(run(f), "agent:sample-agent");
  const lines = read(item.dir, "sample-agent.md").split("\n");
  assert.equal(lines.indexOf("model: provider/project"), 2);
  assert.equal(lines[1], "description: a");
  assert.equal(lines[3], "mode: primary");
  assert.ok(lines.includes("line four"));
});

const CONFLICT_ID = "skill:sample-skill";

function conflictFixture() {
  const f = fixture({
    changeV2: (dir) => {
      write(dir, "skills/demo/sample-skill/SKILL.md", skillFile("1.1.0", "step one\nstep two"));
      write(dir, "skills/demo/sample-skill/workflow.md", "flow UPSTREAM\nflow two\nflow three\n");
      write(dir, "agents/opencode/sample-agent.md", AGENT_V2);
    },
  });
  installV1Skill(f, SKILL_DIR, { workflow: "flow LOCAL\nflow two\nflow three\n" });
  return f;
}

function applyRun(f, selected) {
  return apply({ out: f.out, selected });
}

function lockEntry(f, id = "skill:sample-skill") {
  return JSON.parse(read(f.project, ".agents/marketplace.lock.json"))[id];
}

function snapshot(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
    const full = path.join(entry.parentPath, entry.name);
    return `${path.relative(root, full)}\0${fs.readFileSync(full, "utf8")}`;
  }).sort();
}

test("apply writes only selected items, to every location, adapter untouched", () => {
  const f = fixture();
  installV1Skill(f);
  installV1Skill(f, ".claude/skills/sample-skill");
  write(f.project, `${SKILL_DIR}/project.md`, "lintCommand: make lint\n");
  write(f.project, `${SKILL_DIR}/notes.local.md`, "mine\n");
  write(f.project, AGENT_FILE, agentFile("provider/project", "line one\nline two\nline three"));
  const plan = run(f);
  const agentBefore = read(f.project, AGENT_FILE);
  const result = applyRun(f, ["skill:sample-skill"]);
  assert.deepEqual(result, { applied: ["skill:sample-skill"], skipped: ["agent:sample-agent"], upstream: [] });
  for (const dir of [SKILL_DIR, ".claude/skills/sample-skill"]) {
    assert.equal(read(f.project, `${dir}/SKILL.md`), skillFile("1.1.0", "step one\nstep two"));
  }
  assert.equal(read(f.project, `${SKILL_DIR}/project.md`), "lintCommand: make lint\n");
  assert.equal(read(f.project, `${SKILL_DIR}/notes.local.md`), "mine\n");
  assert.equal(fs.existsSync(path.join(f.project, ".claude/skills/sample-skill/project.md")), false);
  assert.equal(read(f.project, AGENT_FILE), agentBefore);
  assert.equal(plan.ids.length, 2);
});

test("apply keeps the agent model line and removes files the merge removed", () => {
  const f = fixture({
    changeV2: (dir) => {
      fs.rmSync(path.join(dir, "skills/demo/sample-skill/workflow.md"));
      write(dir, "agents/opencode/sample-agent.md", AGENT_V2);
    },
  });
  installV1Skill(f);
  write(f.project, `${SKILL_DIR}/project.md`, "adapter\n");
  write(f.project, AGENT_FILE, agentFile("provider/project", "line one\nline two\nline three"));
  run(f);
  const result = applyRun(f, ["agent:sample-agent", "skill:sample-skill"]);
  assert.deepEqual(result.applied, ["agent:sample-agent", "skill:sample-skill"]);
  assert.equal(read(f.project, AGENT_FILE), agentFile("provider/project", "line one\nline two\nline three\nline four"));
  assert.equal(fs.existsSync(path.join(f.project, SKILL_DIR, "workflow.md")), false);
  assert.equal(read(f.project, `${SKILL_DIR}/project.md`), "adapter\n");
});

test("apply refuses an item whose dir still holds conflict markers", () => {
  const f = conflictFixture();
  write(f.project, AGENT_FILE, agentFile("provider/project", "line one\nline two\nline three"));
  run(f);
  const before = snapshot(f.project);
  assert.throws(() => applyRun(f, ["agent:sample-agent", CONFLICT_ID]), /Conflict markers remain/);
  assert.deepEqual(snapshot(f.project), before);
  assert.equal(fs.existsSync(path.join(f.project, ".agents/marketplace.lock.json")), false);
});

test("apply accepts an item whose conflict was resolved, and ignores resolution.json", () => {
  const f = conflictFixture();
  const plan = run(f);
  const item = itemOf(plan, CONFLICT_ID);
  write(item.dir, "workflow.md", "flow RESOLVED\nflow two\nflow three\n");
  write(item.dir, "resolution.json", JSON.stringify({ hunks: [{ file: "workflow.md", reason: "merged", sure: true }] }));
  const result = applyRun(f, [CONFLICT_ID]);
  assert.deepEqual(result.applied, [CONFLICT_ID]);
  assert.equal(read(f.project, `${SKILL_DIR}/workflow.md`), "flow RESOLVED\nflow two\nflow three\n");
  assert.equal(fs.existsSync(path.join(f.project, SKILL_DIR, "resolution.json")), false);
  assert.deepEqual(result.upstream, [CONFLICT_ID]);
});

test("apply records the new base and the approved hash; lock status reports approved", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  write(f.project, `${SKILL_DIR}/project.md`, "adapter\n");
  run(f);
  const result = applyRun(f, [CONFLICT_ID]);
  assert.deepEqual(result.upstream, [CONFLICT_ID]);
  const entry = lockEntry(f);
  assert.equal(entry.sourceCommit, f.v2);
  assert.equal(entry.version, "1.1.0");
  assert.equal(entry.location, SKILL_DIR);
  assert.match(entry.approved, /^[0-9a-f]{64}$/);
  const report = lockStatus(f.project, f.market);
  assert.equal(report.changed.length, 1);
  assert.equal(report.changed[0].approved, true);
  assert.equal(report.changed[0].contentHash, entry.approved);
  assert.equal(report.changed[0].upstreamMoved, false);
  assert.deepEqual(report.changed[0].files, ["workflow.md"]);
});

test("apply of an outdated copy leaves nothing to send upstream", () => {
  const f = fixture();
  installV1Skill(f);
  run(f);
  const result = applyRun(f, [CONFLICT_ID]);
  assert.deepEqual(result, { applied: [CONFLICT_ID], skipped: [], upstream: [] });
  assert.equal(lockEntry(f).sourceCommit, f.v2);
  assert.deepEqual(lockStatus(f.project, f.market).changed, []);
});

test("apply with none writes nothing", () => {
  const f = fixture();
  installV1Skill(f);
  run(f);
  const before = snapshot(f.project);
  assert.deepEqual(applyRun(f, []), { applied: [], skipped: [CONFLICT_ID], upstream: [] });
  assert.deepEqual(snapshot(f.project), before);
});

test("apply twice with the same answer writes and records nothing new", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  run(f);
  assert.deepEqual(applyRun(f, [CONFLICT_ID]).applied, [CONFLICT_ID]);
  const before = snapshot(f.project);
  const again = applyRun(f, [CONFLICT_ID]);
  assert.deepEqual(again, { applied: [], skipped: [CONFLICT_ID], upstream: [] });
  assert.deepEqual(snapshot(f.project), before);
});

test("apply refuses an unknown id and writes nothing", () => {
  const f = fixture();
  installV1Skill(f);
  run(f);
  const before = snapshot(f.project);
  assert.throws(() => applyRun(f, [CONFLICT_ID, "skill:other"]), /Not in the plan/);
  assert.deepEqual(snapshot(f.project), before);
});

test("apply refuses a plan whose item leaves the project or the work directory", () => {
  const f = fixture();
  installV1Skill(f);
  const plan = run(f);
  const planPath = path.join(f.out, "plan.json");
  const tampered = structuredClone(plan);
  tampered.items[0].locations = ["../outside/sample-skill"];
  fs.writeFileSync(planPath, JSON.stringify(tampered));
  assert.throws(() => applyRun(f, [CONFLICT_ID]), /location/);
  const moved = structuredClone(plan);
  moved.items[0].dir = path.join(f.root, "elsewhere");
  fs.writeFileSync(planPath, JSON.stringify(moved));
  assert.throws(() => applyRun(f, [CONFLICT_ID]), /work directory/);
});

test("the CLI applies the selected ids and none", () => {
  const f = fixture();
  installV1Skill(f);
  run(f);
  const cli = (selected) => spawnSync(process.execPath, [scriptPath, "apply", "--out", f.out, "--selected", selected, "--json"], { encoding: "utf8" });
  const none = cli("none");
  assert.equal(none.status, 0, none.stderr);
  assert.deepEqual(JSON.parse(none.stdout), { applied: [], skipped: [CONFLICT_ID], upstream: [] });
  const some = cli(CONFLICT_ID);
  assert.equal(some.status, 0, some.stderr);
  assert.deepEqual(JSON.parse(some.stdout).applied, [CONFLICT_ID]);
  assert.equal(cli("").status, 1);
});

function deletedUpstreamFixture() {
  const f = fixture({ changeV2: (dir) => fs.rmSync(path.join(dir, "skills/demo/sample-skill/workflow.md")) });
  installV1Skill(f, SKILL_DIR, { workflow: "flow LOCAL\nflow two\nflow three\n" });
  return f;
}

test("apply refuses a deleted-upstream conflict without resolution.json", () => {
  const f = deletedUpstreamFixture();
  run(f);
  const before = snapshot(f.project);
  assert.throws(() => applyRun(f, [CONFLICT_ID]), /resolution/);
  assert.deepEqual(snapshot(f.project), before);
});

test("apply takes a deleted-upstream conflict that resolution.json covers", () => {
  const f = deletedUpstreamFixture();
  const item = itemOf(run(f), CONFLICT_ID);
  write(item.dir, "resolution.json", JSON.stringify({ hunks: [{ file: "workflow.md", reason: "keep the local flow", sure: true }] }));
  assert.deepEqual(applyRun(f, [CONFLICT_ID]).applied, [CONFLICT_ID]);
  assert.equal(read(f.project, `${SKILL_DIR}/workflow.md`), "flow LOCAL\nflow two\nflow three\n");
});

test("apply refuses when resolution.json misses a conflicted file", () => {
  const f = deletedUpstreamFixture();
  const item = itemOf(run(f), CONFLICT_ID);
  write(item.dir, "resolution.json", JSON.stringify({ hunks: [{ file: "other.md", reason: "x", sure: true }] }));
  const before = snapshot(f.project);
  assert.throws(() => applyRun(f, [CONFLICT_ID]), /resolution/);
  assert.deepEqual(snapshot(f.project), before);
});

function lockAtV1(f) {
  write(f.project, ".agents/marketplace.lock.json", JSON.stringify({ schemaVersion: 1, "skill:sample-skill": { kind: "skill", source: "skills/demo/sample-skill", location: SKILL_DIR, sourceCommit: f.v1 } }));
}

function summaryItem(f, id = CONFLICT_ID) {
  return summary({ out: f.out }).items.find((item) => item.id === id);
}

test("prepare records the work directory and the count of modified items", () => {
  const f = conflictFixture();
  write(f.project, AGENT_FILE, AGENT_V1);
  const plan = run(f);
  assert.equal(plan.out, path.resolve(f.out));
  assert.equal(plan.modified, 1);
});

test("summary of an outdated item: versions, clean files, nothing upstream, checked", () => {
  const f = fixture();
  installV1Skill(f);
  run(f);
  const result = summary({ out: f.out });
  assert.deepEqual(result.ids, [CONFLICT_ID]);
  const [item] = result.items;
  assert.deepEqual(Object.keys(item).sort(), ["checked", "detail", "id", "label"]);
  assert.equal(item.id, CONFLICT_ID);
  assert.equal(item.label, "skill sample-skill (outdated) 1.0.0 -> 1.1.0");
  assert.match(item.detail, /Merged cleanly: SKILL\.md \(upstream\)/);
  assert.match(item.detail, /Upstream: nothing to send/);
  assert.equal(item.checked, true);
});

test("summary of a resolved conflict shows the reason, the resolution diff and the upstream part", () => {
  const f = conflictFixture();
  lockAtV1(f);
  const item = itemOf(run(f), CONFLICT_ID);
  write(item.dir, "workflow.md", "flow RESOLVED\nflow two\nflow three\n");
  write(item.dir, "resolution.json", JSON.stringify({ hunks: [{ file: "workflow.md", reason: "keeps the local wording on the upstream line", sure: true }], upstream: { portable: ["workflow.md: clearer first step"], adapter: [] } }));
  const row = summaryItem(f);
  assert.equal(row.label, "skill sample-skill (modified) 1.0.0 -> 1.1.0");
  assert.match(row.detail, /Merged cleanly: SKILL\.md \(upstream\)/);
  assert.match(row.detail, /Conflict in workflow\.md \(both-edited\)/);
  assert.match(row.detail, /keeps the local wording on the upstream line/);
  assert.match(row.detail, /^\s*-flow LOCAL$/m);
  assert.match(row.detail, /^\s*\+flow RESOLVED$/m);
  assert.match(row.detail, /Upstream draft PR: workflow\.md: clearer first step/);
  assert.equal(row.checked, true);
});

test("summary unchecks an unsure hunk, a missing resolution and a guessed base", () => {
  const f = conflictFixture();
  lockAtV1(f);
  const item = itemOf(run(f), CONFLICT_ID);
  const missing = summaryItem(f);
  assert.equal(missing.checked, false);
  assert.match(missing.detail, /conflict markers remain/);
  write(item.dir, "workflow.md", "flow RESOLVED\nflow two\nflow three\n");
  assert.match(summaryItem(f).detail, /no resolution yet/);
  write(item.dir, "resolution.json", JSON.stringify({ hunks: [{ file: "workflow.md", reason: "picked upstream, local intent unclear", sure: false }], upstream: { portable: [], adapter: ["workflow.md: project wording"] } }));
  const unsure = summaryItem(f);
  assert.equal(unsure.checked, false);
  assert.match(unsure.detail, /picked upstream, local intent unclear \(unsure\)/);
  assert.match(unsure.detail, /Stays in the project: workflow\.md: project wording/);
  assert.match(unsure.detail, /Upstream: nothing portable/);

  const guessed = fixture();
  installV1Skill(guessed, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  run(guessed);
  const row = summaryItem(guessed);
  assert.equal(row.checked, false);
  assert.match(row.detail, /Base guessed/);
  assert.match(row.detail, /Upstream: not classified yet/);
});

test("the CLI prints the summary", () => {
  const f = fixture();
  installV1Skill(f);
  run(f);
  const result = spawnSync(process.execPath, [scriptPath, "summary", "--out", f.out, "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), summary({ out: f.out }));
});

test("summary unchecks a modified item whose local change is not classified for upstream", () => {
  const f = fixture();
  installV1Skill(f, SKILL_DIR, { workflow: "flow ONE\nflow two\nflow three\n" });
  lockAtV1(f);
  const item = itemOf(run(f), CONFLICT_ID);
  assert.equal(item.baseGuessed, false);
  const unclassified = summaryItem(f);
  assert.equal(unclassified.checked, false);
  assert.match(unclassified.detail, /Upstream: not classified yet/);
  write(item.dir, "resolution.json", JSON.stringify({ hunks: [], upstream: { portable: ["workflow.md: clearer first step"], adapter: [] } }));
  assert.equal(summaryItem(f).checked, true);
});

test("prepare writes the base, local and upstream side of each item into the work directory", () => {
  const f = conflictFixture();
  const item = itemOf(run(f), CONFLICT_ID);
  assert.equal(item.sides, path.join(path.resolve(f.out), "sides", path.basename(item.dir)));
  assert.equal(read(item.sides, "base/workflow.md"), WORKFLOW_V1);
  assert.equal(read(item.sides, "local/workflow.md"), "flow LOCAL\nflow two\nflow three\n");
  assert.equal(read(item.sides, "upstream/workflow.md"), "flow UPSTREAM\nflow two\nflow three\n");
  assert.equal(fs.existsSync(path.join(item.dir, "base")), false, "the sides stay out of the proposed copy");
  assert.deepEqual(applyRun(f, []).applied, []);
});
