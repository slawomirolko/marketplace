import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateWhen, loadWorkflowDir, loadWorkflowFile, negateWhen } from "../src/workflow-yaml.ts";
import { claudeAgentsFile, claudeTools, describeAgent, marketplaceDir, readMarketplaceAgent } from "../src/marketplace-agents.ts";
import { operationNamed } from "../src/ops.ts";

function writeYaml(text: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
  const file = path.join(dir, "flow.yaml");
  fs.writeFileSync(file, text);
  return file;
}

const VALID = `
name: two-steps
version: 1.0.0
entry: first
roles: { worker: low }
nodes:
  - id: first
    kind: script
    op: builtin.pass
  - id: second
    kind: llm
    role: worker
    agent: olko-review-verifier
    prompt: "Check {{goal}}"
edges:
  - { from: first, to: second }
  - { from: second, to: END }
`;

test("a valid YAML workflow loads with node paths, roles and edges", () => {
  const workflow = loadWorkflowFile(writeYaml(VALID));
  assert.equal(workflow.name, "two-steps");
  assert.deepEqual(workflow.nodes.map((n) => n.path), ["two-steps/first", "two-steps/second"]);
  assert.equal(workflow.roles?.worker, "low");
  assert.equal(workflow.entry, "first");
});

const INVALID: [string, string, RegExp][] = [
  ["unknown operation", VALID.replace("builtin.pass", "builtin.nothing"), /unknown operation builtin\.nothing/],
  ["edge to a missing node", VALID.replace("{ from: second, to: END }", "{ from: second, to: third }"), /edge to unknown node 'third'/],
  ["llm node role without a tier", VALID.replace("roles: { worker: low }", "roles: { other: low }"), /role worker has no tier/],
  ["schema violation", VALID.replace("kind: script", "kind: shell"), /kind/],
  ["broken YAML", "name: [", /YAML/],
];

for (const [label, text, error] of INVALID) {
  test(`a workflow with ${label} is rejected with a clear error`, () => {
    assert.throws(() => loadWorkflowFile(writeYaml(text)), error);
  });
}

const CONDITIONS: [string, Record<string, unknown>, boolean][] = [
  ["merge.findings > 0", { merge: { findings: [{}] } }, true],
  ["merge.findings > 0", { merge: { findings: [] } }, false],
  ["merge.findings == 0", { merge: { findings: [] } }, true],
  ['ask-post.answer == "post"', { "ask-post": { answer: "post" } }, true],
  ['ask-post.answer == "post"', { "ask-post": { answer: "skip" } }, false],
  ['tests.status != "pass"', { tests: { status: "fail" } }, true],
  ["verify.attempts >= 3", { verify: { attempts: 3 } }, true],
];

for (const [when, state, expected] of CONDITIONS) {
  test(`edge condition ${when} on ${JSON.stringify(state)} is ${expected}`, () => {
    assert.equal(evaluateWhen(when, state), expected);
  });
}

test("a missing state path reads as null, so == null and != null test whether it is set", () => {
  assert.equal(evaluateWhen("input.route == null", { input: {} }), true);
  assert.equal(evaluateWhen("input.route != null", { input: { route: "both" } }), true);
  assert.equal(evaluateWhen("merge.findings > 0", {}), false);
  assert.throws(() => evaluateWhen("merge.findings > some", {}), /not a number, boolean, null or quoted string/);
});

test("|| and && combine clauses, with && binding tighter than ||", () => {
  const state = { a: { v: 1 }, b: { v: 2 } };
  assert.equal(evaluateWhen("a.v == 9 || b.v == 2", state), true);
  assert.equal(evaluateWhen("a.v == 1 && b.v == 9", state), false);
  assert.equal(evaluateWhen("a.v == 9 || a.v == 1 && b.v == 2", state), true);
  assert.equal(evaluateWhen("a.v == 9 || a.v == 1 && b.v == 9", state), false);
});

test("a prompt reads every answer and iterates a map of agent results with each", () => {
  const prompt = VALID.replace('prompt: "Check {{goal}}"', 'prompt: "{{answers.q-1}}|{{#each.state.audit}}{{key}}={{value.verdict}};{{/each.state.audit}}"');
  const node = loadWorkflowFile(writeYaml(prompt)).nodes.find((n) => n.id === "second")!;
  const text = node.prompt!({ goal: "g", input: {}, agent: { id: "second", tier: "low" } as never, answers: { "q-1": "yes" }, state: { audit: { dotnet: { verdict: "ok" }, react: { verdict: "fail" } } } });
  assert.equal(text, "yes|dotnet=ok;react=fail;");
});

test("node tools map to Claude Code tools; the Skill tool is never allowed, so installed skill copies are never used", () => {
  assert.deepEqual(claudeTools(["read"]).allowed, ["Read", "Grep", "Glob"]);
  assert.ok(claudeTools(["read", "edit", "bash"]).disallowed.includes("Skill"));
  const write = claudeTools(["read", "edit"]);
  assert.ok(write.allowed.includes("Edit") && write.disallowed.includes("Bash"));
  assert.ok(claudeTools(["read", "bash"]).allowed.includes("Bash"));
});

test("a marketplace skill becomes agent instructions that name the skill directory", () => {
  const skill = readMarketplaceAgent("olko-adapt-to-marketplace");
  assert.ok(skill.skillDir && fs.existsSync(path.join(skill.skillDir, "SKILL.md")));
  assert.match(skill.prompt, /^Follow the skill olko-adapt-to-marketplace/);
  assert.equal(readMarketplaceAgent("olko-review-verifier").skillDir, undefined);
});

test("a YAML node with skill, tools, dirs and a question with allowedFrom loads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
  const file = path.join(dir, "flow.yaml");
  fs.writeFileSync(file, `
name: skill-node
version: 1.0.0
entry: adapt
roles: { adapter: medium }
nodes:
  - id: adapt
    kind: llm
    role: adapter
    skill: olko-adapt-to-marketplace
    tools: [read, edit]
    dirs: ["{{input.marketplace}}"]
    prompt: "go"
  - id: ask
    kind: interrupt
    question: { id: q-pick, text: "Pick", allowedFrom: state.adapt.options }
edges:
  - { from: adapt, to: ask }
  - { from: ask, to: END }
`);
  const workflow = loadWorkflowFile(file);
  const adapt = workflow.nodes[0]!;
  assert.equal(adapt.agent, "olko-adapt-to-marketplace");
  assert.deepEqual(adapt.tools, ["read", "edit"]);
  assert.deepEqual(adapt.dirs?.({ goal: "", input: { marketplace: "C:/m" }, state: {}, agent: { id: "adapt" } }), ["C:/m"]);
  assert.equal(workflow.nodes[1]!.question?.allowedFrom, "state.adapt.options");
});

test("the marketplace skill sync workflow loads from YAML with its phase groups", () => {
  const workflow = loadWorkflowDir(path.join(import.meta.dirname, "..", "workflows")).get("olko-marketplace-skill-sync")!;
  assert.equal(workflow.name, "olko-marketplace-skill-sync");
  assert.equal(workflow.nodes.find((n) => n.id === "adapt")?.agent, "olko-adapt-to-marketplace");
  assert.deepEqual(workflow.nodes.find((n) => n.id === "compare")?.tools, ["read", "bash"]);
});

test("an agent's declared skills are read from the marketplace checkout, not from installed copies", () => {
  const agent = readMarketplaceAgent("olko-review-bugs-lens");
  const caveman = path.join(marketplaceDir(), "skills", "caveman", "caveman", "SKILL.md");
  assert.deepEqual(agent.skills, [{ name: "caveman", file: caveman }]);
  assert.ok(agent.prompt.includes(caveman), "the instructions name the marketplace SKILL.md path");
  assert.match(agent.prompt, /not through the Skill tool/);
  assert.deepEqual(agent.dirs, [path.dirname(caveman)]);
});

test("a changed agent or skill in the marketplace reaches the next run without a factory restart", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-marketplace-"));
  const source = marketplaceDir();
  for (const rel of ["agents/opencode/olko-review-bugs-lens.md", "agents/opencode/index.json", "skills/caveman/caveman/SKILL.md"]) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.copyFileSync(path.join(source, rel), path.join(root, rel));
  }
  const previous = process.env.FACTORY_MARKETPLACE_DIR;
  process.env.FACTORY_MARKETPLACE_DIR = root;
  try {
    const read = () => JSON.parse(fs.readFileSync(claudeAgentsFile("olko-review-bugs-lens"), "utf8"))["olko-review-bugs-lens"].prompt as string;
    assert.ok(!read().includes("Changed rule"));
    fs.appendFileSync(path.join(root, "agents/opencode/olko-review-bugs-lens.md"), "\nChanged rule.\n");
    assert.ok(read().includes("Changed rule"));
  } finally {
    if (previous === undefined) delete process.env.FACTORY_MARKETPLACE_DIR;
    else process.env.FACTORY_MARKETPLACE_DIR = previous;
  }
});

test("a Claude Code plugin agent loads with its plugin root and its namespaced preloaded skills from the marketplace", () => {
  const agent = readMarketplaceAgent("olko-claude-sync-inventory");
  const root = path.join(marketplaceDir(), "plugins", "olko-sync");
  assert.equal(agent.pluginRoot, root);
  assert.deepEqual(agent.skills, [{ name: "olko-sync:olko-sync-state", file: path.join(root, "skills", "olko-sync-state", "SKILL.md") }]);
  assert.ok(!agent.prompt.includes("${CLAUDE_PLUGIN_ROOT}/skills"), "the plugin root is filled in");
  assert.ok(agent.prompt.includes(`CLAUDE_PLUGIN_ROOT is ${root}`));
  assert.ok(agent.dirs.includes(root));
});

test("an agent lists the scripts of the skills it loads, and a skill its own, without test files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-marketplace-"));
  const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write("skills/demo/sync/SKILL.md", "---\ndescription: sync\n---\nbody\n");
  write("skills/demo/sync/scripts/sync.mjs", "");
  write("skills/demo/sync/scripts/sync.test.mjs", "");
  write("skills/demo/sync/scripts/watch.Tests.ps1", "");
  write("skills/demo/plain/SKILL.md", "---\ndescription: plain\n---\nbody\n");
  write("agents/opencode/syncer.md", "---\ndescription: syncer\npermission:\n  skill:\n    sync: allow\n    plain: allow\n---\nbody\n");
  const previous = process.env.FACTORY_MARKETPLACE_DIR;
  process.env.FACTORY_MARKETPLACE_DIR = root;
  try {
    assert.deepEqual(describeAgent("syncer")?.scripts, [{ skill: "sync", name: "sync.mjs", file: "skills/demo/sync/scripts/sync.mjs" }]);
    assert.deepEqual(describeAgent("sync")?.scripts, [{ skill: "sync", name: "sync.mjs", file: "skills/demo/sync/scripts/sync.mjs" }]);
    assert.deepEqual(describeAgent("plain")?.scripts, []);
  } finally {
    if (previous === undefined) delete process.env.FACTORY_MARKETPLACE_DIR;
    else process.env.FACTORY_MARKETPLACE_DIR = previous;
  }
});

test("an agent has the memory layer attached when it declares the configured memory skill", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-marketplace-"));
  const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write("skills/ai/olko-memory-layer/SKILL.md", "---\ndescription: memory\n---\nbody\n");
  write("skills/ai/notes/SKILL.md", "---\ndescription: notes\n---\nbody\n");
  write("agents/opencode/rememberer.md", "---\ndescription: rememberer\npermission:\n  skill:\n    \"*\": deny\n    olko-memory-layer: allow\n---\nbody\n");
  write("agents/opencode/denied.md", "---\ndescription: denied\npermission:\n  skill:\n    olko-memory-layer: deny\n    notes: allow\n---\nbody\n");
  write("agents/opencode/listed.md", "---\ndescription: listed\n---\nbody\n");
  write("agents/opencode/index.json", JSON.stringify({ agents: [{ name: "listed", skills: ["notes"] }] }));
  const previous = process.env.FACTORY_MARKETPLACE_DIR;
  process.env.FACTORY_MARKETPLACE_DIR = root;
  try {
    assert.equal(describeAgent("rememberer")?.memoryLayer, true);
    assert.equal(describeAgent("denied")?.memoryLayer, false, "a denied skill is not attached");
    assert.equal(describeAgent("olko-memory-layer")?.memoryLayer, false, "the memory skill itself is not an agent with memory");
    assert.equal(describeAgent("rememberer", "notes")?.memoryLayer, false);
    assert.equal(describeAgent("denied", "notes")?.memoryLayer, true, "the memory skill name comes from the caller");
    assert.equal(describeAgent("listed", "notes")?.memoryLayer, true, "a skill listed in index.json counts too");
  } finally {
    if (previous === undefined) delete process.env.FACTORY_MARKETPLACE_DIR;
    else process.env.FACTORY_MARKETPLACE_DIR = previous;
  }
});

test("a switched subgraph gets a gate: switch on enters it, switch off goes straight to its exits", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
  fs.writeFileSync(path.join(dir, "tracker.yaml"), `
name: tracker-steps
version: 1.0.0
entry: read
nodes:
  - { id: read, kind: script, op: builtin.pass }
edges:
  - { from: read, to: END }
`);
  fs.writeFileSync(path.join(dir, "main.yaml"), `
name: main
version: 1.0.0
entry: start
nodes:
  - { id: start, kind: script, op: builtin.pass }
  - { id: tracker, kind: subgraph, workflow: tracker-steps, enabledWhen: "switches.tracker == true" }
  - { id: plan, kind: script, op: builtin.pass }
edges:
  - { from: start, to: tracker }
  - { from: tracker, to: plan }
  - { from: plan, to: END }
`);
  const main = loadWorkflowDir(dir).get("main")!;
  assert.ok(main.nodes.some((n) => n.id === "tracker") && main.nodes.some((n) => n.id === "tracker/read"));
  const gate = main.edges.filter((e) => e.from === "tracker");
  assert.deepEqual(gate, [{ from: "tracker", to: "tracker/read", when: "switches.tracker == true" }, { from: "tracker", to: "plan", when: "switches.tracker != true" }]);
  assert.ok(main.edges.some((e) => e.from === "tracker/read" && e.to === "plan"));
  const off = await main.nodes.find((n) => n.id === "tracker")!.script!({ input: { switches: { tracker: false } }, state: {}, exec: undefined });
  assert.equal((off.state as { enabled: boolean }).enabled, false);
  assert.match(String(off.output), /skipped: switch off/);
  assert.equal(negateWhen("a.b != 3"), "a.b == 3");
  assert.throws(() => negateWhen("a.b > 3"), /== or !=/);
});

test("a group inlines another YAML file with its node ids unchanged and rejects an id used twice", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
  fs.writeFileSync(path.join(dir, "questions.yaml"), `
name: questions
version: 1.0.0
entry: ask
nodes:
  - { id: ask, kind: interrupt, question: { id: q-a, text: "A?", allowed: [yes, no] } }
  - { id: record, kind: script, op: builtin.pass }
edges:
  - { from: ask, to: record, when: 'ask.answer == "yes"' }
  - { from: ask, to: END }
  - { from: record, to: END }
`);
  fs.writeFileSync(path.join(dir, "main.yaml"), `
name: main
version: 1.0.0
entry: intake
nodes:
  - { id: intake, kind: group, workflow: questions }
  - { id: next, kind: script, op: builtin.pass }
edges:
  - { from: intake, to: next }
  - { from: next, to: END }
`);
  const main = loadWorkflowDir(dir).get("main")!;
  assert.equal(main.entry, "ask");
  assert.deepEqual(main.nodes.map((n) => n.id).sort(), ["ask", "next", "record"]);
  assert.deepEqual(main.edges.filter((e) => e.to === "next").map((e) => e.from).sort(), ["ask", "record"]);
  fs.writeFileSync(path.join(dir, "main.yaml"), fs.readFileSync(path.join(dir, "main.yaml"), "utf8").replace("  - { id: next, kind: script, op: builtin.pass }", "  - { id: record, kind: script, op: builtin.pass }").replace(/next/g, "record"));
  assert.throws(() => loadWorkflowDir(dir), /node id record is used twice/);
});

test("a node workspace template renders over state, and a stop reason is a template over state, input and answers", async () => {
  const file = writeYaml(`
name: moves
version: 1.0.0
entry: create
roles: { worker: low }
nodes:
  - { id: create, kind: llm, role: worker, agent: olko-review-verifier, prompt: "Create it.", parse: { json: [path] }, workspace: "{{state.create.create.path}}" }
  - { id: stop, kind: script, op: builtin.stop, with: { reason: "stopped in {{state.create.create.path}} for {{input.taskId}}: {{#each.state.checks}}{{key}}={{value}} {{/each.state.checks}}" } }
edges:
  - { from: create, to: stop }
  - { from: stop, to: END }
`);
  const create = loadWorkflowFile(file).nodes.find((n) => n.id === "create")!;
  assert.equal(create.workspace?.({ goal: "", input: {}, state: { create: { create: { path: "/tmp/wt" } } }, agent: { id: "create" } }), "/tmp/wt");
  assert.equal(create.workspace?.({ goal: "", input: {}, state: {}, agent: { id: "create" } }), "");
  const stop = operationNamed("builtin.stop")!;
  await assert.rejects(stop({ state: { create: { create: { path: "/tmp/wt" } }, checks: { flow: "PASS", test: "BLOCKED" } }, input: { taskId: "t1" }, answers: {}, args: { reason: "stopped in {{state.create.create.path}} for {{input.taskId}}: {{#each.state.checks}}{{key}}={{value}} {{/each.state.checks}}" } } as never), { message: "stopped in /tmp/wt for t1: flow=PASS test=BLOCKED" });
});
