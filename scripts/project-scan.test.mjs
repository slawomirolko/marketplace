import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classify, detectHarnesses, frontMatter, portableText, projectStatus, workflowIndex, writeStatus } from "../skills/software-factory/olko-factory-project/scripts/project-scan.mjs";

const marketplaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(marketplaceRoot, "skills", "software-factory", "olko-factory-project", "scripts", "project-scan.mjs");

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" }).trim();
}

function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

const skill = (version, step) => `---\nname: sample-skill\nversion: ${version}\ndescription: x\n---\n# Sample\n${step}\n`;
const agent = (model, extra = "") => `---\ndescription: a\nmode: primary\nmodel: ${model}\npermission:\n  skill:\n    "*": deny\n    sample-skill: allow\n    sample-needed: allow\n  task:\n    sample-helper: allow\n---\nBody${extra}\n`;

/** A marketplace with two versions of sample-skill, an agent, a removed skill and one workflow. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-scan-test-"));
  const market = path.join(root, "market");
  write(market, "skills/demo/sample-skill/SKILL.md", skill("1.0.0", "step one"));
  write(market, "skills/demo/sample-skill/workflow.md", "flow v1\n");
  write(market, "skills/demo/sample-old/SKILL.md", "---\nname: sample-old\n---\nold\n");
  write(market, "skills/demo/sample-needed/SKILL.md", "---\nname: sample-needed\n---\nneeded\n");
  write(market, "agents/opencode/sample-agent.md", agent("provider/a"));
  write(market, "agents/opencode/sample-helper.md", "---\ndescription: h\n---\nhelp\n");
  write(market, "factory/workflows/sample-flow.yaml", "name: sample-flow\nsource: \"agents/opencode/sample-agent.md\"\nnodes:\n  - id: a\n    agent: sample-agent\n  - id: b\n    skill: sample-skill\n");
  git(root, "init", "-q", "-b", "main", market);
  git(market, "add", ".");
  git(market, "commit", "-q", "-m", "v1");
  const v1 = git(market, "rev-parse", "HEAD");
  write(market, "skills/demo/sample-skill/SKILL.md", skill("1.1.0", "step one\nstep two"));
  fs.rmSync(path.join(market, "skills/demo/sample-old"), { recursive: true });
  git(market, "add", "-A");
  git(market, "commit", "-q", "-m", "v2");
  const project = path.join(root, "sample-app");
  fs.mkdirSync(project);
  return { root, market, project, v1 };
}

function statusOf(f) {
  return projectStatus({ project: f.project, marketplace: f.market, factory: path.join(f.market, "factory") });
}

function byId(status, id) {
  return status.artifacts.find((a) => a.id === id);
}

test("an exact copy of HEAD is current, a HEAD copy with an adapter is adapted", () => {
  const f = fixture();
  write(f.project, ".agents/skills/sample-skill/SKILL.md", skill("1.1.0", "step one\nstep two").replace(/\n/g, "\r\n"));
  write(f.project, ".agents/skills/sample-skill/workflow.md", "flow v1\n");
  assert.equal(byId(statusOf(f), "skill:sample-skill").state, "current", "line endings do not count");
  write(f.project, ".agents/skills/sample-skill/project.md", "lintCommand: make lint\n");
  const adapted = byId(statusOf(f), "skill:sample-skill");
  assert.equal(adapted.state, "adapted");
  assert.equal(adapted.installed, "1.1.0");
});

test("an agent with a project model is adapted, not modified", () => {
  const f = fixture();
  write(f.project, ".opencode/agents/sample-agent.md", agent("provider/b"));
  const status = statusOf(f);
  assert.equal(byId(status, "agent:sample-agent").state, "adapted");
  assert.deepEqual(byId(status, "agent:sample-agent").workflows, ["sample-flow"]);
});

test("a copy of an older version is outdated with both versions", () => {
  const f = fixture();
  write(f.project, ".agents/skills/sample-skill/SKILL.md", skill("1.0.0", "step one"));
  write(f.project, ".agents/skills/sample-skill/workflow.md", "flow v1\n");
  const entry = byId(statusOf(f), "skill:sample-skill");
  assert.equal(entry.state, "outdated");
  assert.equal(entry.installed, "1.0.0");
  assert.equal(entry.current, "1.1.0");
  assert.equal(entry.base, f.v1);
  assert.deepEqual(entry.files, ["SKILL.md"]);
});

test("a local edit is modified against the nearest version and lists its files", () => {
  const f = fixture();
  write(f.project, ".agents/skills/sample-skill/SKILL.md", skill("1.0.0", "step one"));
  write(f.project, ".agents/skills/sample-skill/workflow.md", "flow v1, edited\n");
  const entry = byId(statusOf(f), "skill:sample-skill");
  assert.equal(entry.state, "modified");
  assert.equal(entry.installed, "1.0.0");
  assert.deepEqual(entry.files, ["workflow.md"]);
  assert.equal(entry.upstreamMoved, true);
});

test("a copy that shares no file with any version has an unknown base", () => {
  const f = fixture();
  write(f.project, ".agents/skills/sample-skill/SKILL.md", "rewritten\n");
  const entry = byId(statusOf(f), "skill:sample-skill");
  assert.equal(entry.state, "unknown-base");
  assert.equal(entry.nearestVersion, "1.1.0");
});

test("removed, local-only and missing artifacts are reported", () => {
  const f = fixture();
  write(f.project, ".agents/skills/sample-old/SKILL.md", "---\nname: sample-old\n---\nold\n");
  write(f.project, ".agents/skills/sample-local/SKILL.md", "---\nname: sample-local\n---\nlocal\n");
  write(f.project, ".opencode/agents/sample-agent.md", agent("provider/a"));
  const status = statusOf(f);
  assert.equal(byId(status, "skill:sample-old").state, "removed");
  assert.equal(byId(status, "skill:sample-local").state, "local-only");
  assert.equal(byId(status, "skill:sample-needed").state, "missing");
  assert.deepEqual(byId(status, "skill:sample-needed").requiredBy, ["agent:sample-agent"]);
  assert.equal(byId(status, "agent:sample-helper").state, "missing");
  assert.equal(byId(status, "skill:sample-skill").state, "missing", "allowed by the agent and not installed");
  assert.equal(status.counts.missing, 3);
  assert.deepEqual(status.workflows, ["sample-flow"]);
  assert.match(status.summary, /1 current, 3 missing, 1 removed, 1 local-only/);
});

test("a marketplace source checkout is marked and says so when nothing is installed", () => {
  const f = fixture();
  assert.equal(statusOf(f).marketplaceSource, false);
  assert.equal(statusOf(f).summary, "no marketplace artifacts installed");
  write(f.project, "registry.json", "{}");
  assert.equal(statusOf(f).marketplaceSource, false, "registry.json alone is not enough");
  write(f.project, "skills/demo/sample-skill/SKILL.md", skill("1.1.0", "step one\nstep two"));
  const status = statusOf(f);
  assert.equal(status.marketplaceSource, true);
  assert.equal(status.summary, "marketplace source repository, no installed copies");
  assert.equal(status.artifacts.length, 0, "skills under skills/<category>/ are sources, not installed copies");
  write(f.project, ".agents/skills/sample-skill/SKILL.md", skill("1.1.0", "step one\nstep two"));
  write(f.project, ".agents/skills/sample-skill/workflow.md", "flow v1\n");
  assert.match(statusOf(f).summary, /^1 current$/);
});

test("harness markers are detected", () => {
  const f = fixture();
  write(f.project, "CLAUDE.md", "x");
  write(f.project, "opencode.json", "{}");
  assert.deepEqual(detectHarnesses(f.project).map((h) => h.id), ["opencode", "claude-code"]);
});

test("the CLI writes the full status to the out dir, prints a short result and never writes in the project", () => {
  const f = fixture();
  write(f.project, ".agents/skills/sample-skill/SKILL.md", skill("1.0.0", "step one"));
  write(f.project, ".agents/skills/sample-skill/workflow.md", "flow v1\n");
  const before = fs.readdirSync(f.project, { recursive: true }).sort();
  const outDir = path.join(f.root, "out");
  const result = spawnSync(process.execPath, [scriptPath, "status", "--project", f.project, "--id", "sample-app", "--marketplace", f.market, "--out-dir", outDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const short = JSON.parse(result.stdout);
  assert.equal(short.counts.outdated, 1);
  assert.match(path.basename(short.file), /^sample-app-.*\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(short.file, "utf8")).artifacts[0].id, "skill:sample-skill");
  assert.deepEqual(fs.readdirSync(f.project, { recursive: true }).sort(), before);
});

test("the CLI fails with a message for a bad command or a missing project", () => {
  assert.equal(spawnSync(process.execPath, [scriptPath, "scan"], { encoding: "utf8" }).status, 2);
  const missing = spawnSync(process.execPath, [scriptPath, "status", "--project", path.join(os.tmpdir(), "no-such-sample-project")], { encoding: "utf8" });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /is not a folder/);
});

test("front matter, portable text and helpers", () => {
  const meta = frontMatter("---\nversion: \"2.0.0\"\nuses: [caveman, sample-x]\npermission:\n  skill:\n    \"*\": deny\n    sample-a: allow\n  task:\n    sample-b: ask\n---\n");
  assert.deepEqual(meta, { version: "2.0.0", uses: ["caveman", "sample-x"], skills: ["sample-a"], tasks: ["sample-b"] });
  assert.equal(frontMatter("---\nmetadata:\n  version: 3.1.0\nuses:\n  - sample-y\n---\n").version, "3.1.0");
  assert.deepEqual(frontMatter("---\nuses:\n  - sample-y\n---\n").uses, ["sample-y"]);
  assert.equal(portableText("agent", "---\nmodel: a\nmode: all\n---\nx"), "---\nmode: all\n---\nx");
  assert.equal(portableText("skill", "a\r\nb"), "a\nb");
  assert.deepEqual(classify({ files: {} }, [], false), { state: "local-only", installed: null, current: null, files: [] });
  assert.equal(workflowIndex(path.join(os.tmpdir(), "no-such-workflows")).size, 0);
  const out = writeStatus({ head: null, counts: {}, harnesses: [], workflows: [], summary: "" }, { outDir: fs.mkdtempSync(path.join(os.tmpdir(), "project-scan-out-")), id: "Bad Id" });
  assert.match(path.basename(out.file), /^project-/);
});
