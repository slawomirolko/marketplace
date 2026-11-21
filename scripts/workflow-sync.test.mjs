import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { artifactName, workflowFamily, workflowGraph } from "../skills/software-factory/olko-factory-workflow-sync/scripts/workflow-sync.mjs";

const marketplaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(marketplaceRoot, "skills", "software-factory", "olko-factory-workflow-sync", "scripts", "workflow-sync.mjs");
const factory = path.join(marketplaceRoot, "factory");

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" }).trim();
}

const workflowYaml = (name, source) => `name: ${name}
version: 0.1.0
description: "Test workflow ${name}."
source: "${source}"
entry: step
nodes:
  - { id: step, kind: script, op: builtin.pass, description: "Passes." }
edges:
  - { from: step, to: END }
`;

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-sync-test-"));
  const marketplace = path.join(root, "marketplace");
  fs.mkdirSync(path.join(marketplace, "agents", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(marketplace, "agents", "opencode", "olko-a.md"), "---\ndescription: a\nmode: subagent\n---\nstep one\n");
  git(root, "init", "-q", "-b", "main", marketplace);
  git(marketplace, "add", ".");
  git(marketplace, "commit", "-q", "-m", "a");
  const workflows = path.join(root, "factory", "workflows");
  fs.mkdirSync(workflows, { recursive: true });
  fs.writeFileSync(path.join(workflows, "wf-a.yaml"), workflowYaml("wf-a", "agents/opencode/olko-a.md (step one)"));
  const env = { ...process.env, FACTORY_MARKETPLACE_DIR: marketplace };
  execFileSync(process.execPath, [path.join(factory, "src", "sources-lock.ts"), "lock", "--workflows", workflows, "--marketplace", marketplace, "--names", "wf-a"], { env });
  fs.writeFileSync(path.join(marketplace, "agents", "opencode", "olko-a.md"), "---\ndescription: a\nmode: subagent\n---\nstep one\nstep two\n");
  fs.writeFileSync(path.join(marketplace, "agents", "opencode", "olko-b.md"), "---\ndescription: b\nmode: primary\n---\nmain agent\n");
  git(marketplace, "add", ".");
  git(marketplace, "commit", "-q", "-m", "b");
  return { root, marketplace, workflows, env, lockFile: path.join(root, "factory", "workflows.lock.json") };
}

function run(env, ...args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function scan(ctx) {
  return run(ctx.env, "scan", "--marketplace", ctx.marketplace, "--factory", factory, "--workflows", ctx.workflows, "--state-dir", path.join(ctx.root, "state"));
}

test("scan lists the changed source with its diff and the new main agent, and keeps a copy of the YAML", () => {
  const ctx = setup();
  const out = scan(ctx);
  assert.equal(out.pending, 2);
  assert.deepEqual(out.items.map((i) => [i.kind, i.source, i.ask]), [["changed", "agents/opencode/olko-a.md", false], ["new", "agents/opencode/olko-b.md", true]]);
  const item = JSON.parse(fs.readFileSync(out.items[0].itemFile, "utf8"));
  assert.deepEqual(item.yamlFiles, [path.join(ctx.workflows, "wf-a.yaml")]);
  assert.match(fs.readFileSync(item.diffFile, "utf8"), /\+step two/);
  assert.ok(fs.existsSync(path.join(out.stateDir, "snapshot", "wf-a.yaml")));
});

test("scan --only keeps only the items of the named skills and agents", () => {
  const ctx = setup();
  const args = ["scan", "--marketplace", ctx.marketplace, "--factory", factory, "--workflows", ctx.workflows];
  const onlyB = run(ctx.env, ...args, "--state-dir", path.join(ctx.root, "state-b"), "--only", "olko-b");
  assert.deepEqual(onlyB.items.map((i) => [i.n, i.source]), [[1, "agents/opencode/olko-b.md"]]);
  const both = run(ctx.env, ...args, "--state-dir", path.join(ctx.root, "state-ab"), "--only", "olko-a,olko-x", "--only", "olko-b");
  assert.equal(both.items.length, 2);
  const none = run(ctx.env, ...args, "--state-dir", path.join(ctx.root, "state-none"), "--only", "olko-z");
  assert.deepEqual(none.items, []);
});

test("artifactName reads skill and agent names from source paths", () => {
  assert.equal(artifactName("agents/opencode/olko-a.md"), "olko-a");
  assert.equal(artifactName("skills/software-factory/olko-factory-project/SKILL.md"), "olko-factory-project");
  assert.equal(artifactName("skills/demo/sample-skill/scripts/x.mjs"), "sample-skill");
});

test("round counts rounds per source, validates, and records the last verifier verdict; finish approve locks only verified workflows", () => {
  const ctx = setup();
  const { stateDir } = scan(ctx);
  const source = "agents/opencode/olko-a.md";
  const first = run(ctx.env, "round", "--state-dir", stateDir, "--source", source, "--needs-op", "engine op x: does y");
  assert.deepEqual([first.round, first.valid], [1, true]);
  fs.writeFileSync(path.join(ctx.workflows, "wf-a.yaml"), workflowYaml("wf-a", "agents/opencode/olko-a.md (steps one and two)"));
  const second = run(ctx.env, "round", "--state-dir", stateDir, "--source", source, "--last-verdict", "fail");
  assert.equal(second.round, 2);
  const diff = run(ctx.env, "diff", "--state-dir", stateDir, "--last-verdict", "pass", "--last-engine-gaps", "1");
  assert.equal(diff.changed, 1);
  assert.equal(diff.open, "none");
  assert.match(diff.needsOp, /engine op x: does y/);
  assert.match(fs.readFileSync(diff.diffFile, "utf8"), /steps one and two/);
  const before = JSON.parse(fs.readFileSync(ctx.lockFile, "utf8"))["wf-a"].commit;
  const done = run(ctx.env, "finish", "--state-dir", stateDir, "--decision", "approve");
  assert.deepEqual(done.locked, ["wf-a"]);
  assert.notEqual(JSON.parse(fs.readFileSync(ctx.lockFile, "utf8"))["wf-a"].commit, before);
  assert.match(done.report, /agents\/opencode\/olko-a\.md: pass; needs engine work: engine op x: does y \| 1 engine gaps/);
  assert.match(done.report, /agents\/opencode\/olko-b\.md: skipped/);
});

test("a source still open is not locked, and finish revert restores every YAML file and removes new ones", () => {
  const ctx = setup();
  const { stateDir } = scan(ctx);
  run(ctx.env, "round", "--state-dir", stateDir, "--source", "agents/opencode/olko-a.md");
  fs.writeFileSync(path.join(ctx.workflows, "wf-a.yaml"), "broken: [");
  fs.writeFileSync(path.join(ctx.workflows, "wf-b.yaml"), workflowYaml("wf-b", "agents/opencode/olko-b.md"));
  const diff = run(ctx.env, "diff", "--state-dir", stateDir, "--last-verdict", "fail");
  assert.equal(diff.open, "agents/opencode/olko-a.md");
  const lock = fs.readFileSync(ctx.lockFile, "utf8");
  const done = run(ctx.env, "finish", "--state-dir", stateDir, "--decision", "revert");
  assert.deepEqual(done.locked, []);
  assert.equal(fs.readFileSync(ctx.lockFile, "utf8"), lock);
  assert.equal(fs.readFileSync(path.join(ctx.workflows, "wf-a.yaml"), "utf8"), workflowYaml("wf-a", "agents/opencode/olko-a.md (step one)"));
  assert.ok(!fs.existsSync(path.join(ctx.workflows, "wf-b.yaml")));
  assert.match(done.report, /Reverted/);
});

test("the family of a workflow is every workflow of the roots that contain it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-sync-family-"));
  fs.writeFileSync(path.join(dir, "root.yaml"), "name: root\nnodes:\n  - { id: g, kind: group, workflow: part }\n");
  fs.writeFileSync(path.join(dir, "part.yaml"), "name: part\nnodes:\n  - { id: c, kind: call, workflow: shared }\n");
  fs.writeFileSync(path.join(dir, "shared.yaml"), "name: shared\nnodes: []\n");
  fs.writeFileSync(path.join(dir, "other.yaml"), "name: other\nnodes:\n  - { id: c, kind: call, workflow: shared }\n");
  assert.deepEqual(workflowFamily(workflowGraph(dir), ["part"]), ["part", "root", "shared"]);
});
