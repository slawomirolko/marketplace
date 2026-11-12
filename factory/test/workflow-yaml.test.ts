import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateWhen, loadWorkflowDir, loadWorkflowFile, negateWhen } from "../src/workflow-yaml.ts";
import { claudeAgentsFile, claudeTools, marketplaceDir, readMarketplaceAgent } from "../src/marketplace-agents.ts";
import { buildCapabilities, bumpVersion, claudeSyncActions, normalizeName, parseCapabilities, parseComparison, parsePrLine, parseVerdict, syncOptions } from "../src/ops.ts";

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
    op: review.detectLenses
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
  ["unknown operation", VALID.replace("review.detectLenses", "review.nothing"), /unknown operation review\.nothing/],
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

test("an edge condition on a missing state path is rejected", () => {
  assert.throws(() => evaluateWhen("merge.findings > 0", {}), /merge\.findings is not set/);
});

test("the comparator result line becomes a classification with versions and action", () => {
  const parsed = parseComparison("Report text\nresult | portable-local-change | 1.0.0 | minor | 1.1.0 | adopt minor\n");
  assert.deepEqual({ ...parsed, report: undefined }, { classification: "portable-local-change", marketplaceVersion: "1.0.0", bump: "minor", nextVersion: "1.1.0", action: "adopt minor", report: undefined });
  assert.equal(parseComparison("`result | identical | 2.0.0 | none | none | none`").classification, "identical");
});

test("a comparator report without a result line or with an unknown classification is rejected", () => {
  assert.throws(() => parseComparison("no result here"), /no 'result \|' line/);
  assert.throws(() => parseComparison("result | maybe | 1.0.0 | none | none | leave"), /unknown classification 'maybe'/);
});

test("decision options follow the classification as the source agent lists them", () => {
  assert.deepEqual(syncOptions("local-only"), ["create", "reject", "leave"]);
  assert.deepEqual(syncOptions("adapter-candidate"), ["move-to-adapter", "adopt-patch", "adopt-minor", "adopt-major", "revert-local", "leave"]);
  assert.deepEqual(syncOptions("conflict"), ["adopt-patch", "adopt-minor", "adopt-major", "revert-local", "leave"]);
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

test("the marketplace skill sync workflow loads from YAML", () => {
  const workflow = loadWorkflowFile(path.join(import.meta.dirname, "..", "workflows", "olko-marketplace-skill-sync.yaml"));
  assert.equal(workflow.name, "olko-marketplace-skill-sync");
  assert.equal(workflow.nodes.find((n) => n.id === "adapt")?.agent, "olko-adapt-to-marketplace");
  assert.deepEqual(workflow.nodes.find((n) => n.id === "compare")?.tools, undefined);
});

test("an adopt decision bumps the marketplace version by its part", () => {
  assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");
  assert.equal(bumpVersion("none", "patch"), "1.0.0");
});

test("the publish result line gives the PR; a push to main or a missing PR URL is rejected", () => {
  assert.deepEqual(parsePrLine("done\npr | https://github.com/o/r/pull/7 | feat/sync-x | abc123"), { url: "https://github.com/o/r/pull/7", branch: "feat/sync-x", commit: "abc123" });
  assert.throws(() => parsePrLine("pr | https://github.com/o/r/pull/7 | main | abc"), /feature branch/);
  assert.throws(() => parsePrLine("pr | none | feat/x | abc"), /no PR URL/);
  assert.throws(() => parsePrLine("no line"), /no 'pr \|' line/);
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

test("the matcher's last json block becomes capabilities; a malformed one is rejected", () => {
  const text = 'table...\n```json\n{"capabilities":[{"id":"design-rules","basis":"name","kind":"skill","copies":{"olko":{"name":"olko-design-rules","path":"skills/workflow/olko-design-rules","version":"1.0.0"}}}],"probable":[]}\n```';
  assert.equal(parseCapabilities(text).capabilities[0]!.id, "design-rules");
  assert.throws(() => parseCapabilities("no json"), /no ```json block/);
  assert.throws(() => parseCapabilities('```json\n{"capabilities":[{"id":"x","kind":"tool","copies":{}}]}\n```'), /malformed/);
});

test("names match across stores without the olko- prefix or a plugin namespace", () => {
  assert.equal(normalizeName("olko-design-rules"), "design-rules");
  assert.equal(normalizeName("frontend-design:frontend-design"), "frontend-design");
});

test("comparator verdicts map to the actions of the source table", () => {
  assert.equal(parseVerdict("x\nresult | target-ahead | minor | 1.1.0 | port").verdict, "target-ahead");
  assert.throws(() => parseVerdict("result | newer | none | none | x"), /unknown verdict 'newer'/);
  assert.deepEqual(claudeSyncActions("olko-only"), ["install-user", "reject", "exclude", "leave"]);
  assert.deepEqual(claudeSyncActions("platform-delta-only"), ["leave", "exclude"]);
  assert.deepEqual(claudeSyncActions("identical"), []);
});

test("capabilities keep the matcher's links, add name links and single-store artifacts, and make paths absolute", () => {
  const inventory = {
    target: { rows: [{ kind: "skill" as const, name: "frontend-design", path: "plugins/frontend-design/skills/frontend-design" }] },
    olko: { rows: [{ kind: "skill" as const, name: "olko-design-rules", path: "skills/workflow/olko-design-rules", version: "1.0.0" }, { kind: "agent" as const, name: "olko-review-verifier", path: "agents/opencode/olko-review-verifier.md" }] },
    user: { rows: [{ kind: "skill" as const, name: "olko-design-rules", path: "skills/olko-design-rules" }, { kind: "agent" as const, name: "scan-verifier", path: "agents/scan-verifier.md" }] },
  };
  const roots = { target: "/t", olko: "/o", user: "/u" };
  const linked = [{ id: "verifier", basis: "probable", kind: "agent" as const, copies: { olko: { name: "olko-review-verifier", path: "" }, user: { name: "scan-verifier", path: "" } } }];
  const caps = buildCapabilities(inventory, roots, linked);
  assert.deepEqual(caps.map((c) => `${c.id}:${c.basis}:${Object.keys(c.copies).join(",")}`).sort(), ["design-rules:name:olko,user", "frontend-design:single:target", "verifier:probable:olko,user"]);
  assert.equal(caps.find((c) => c.id === "design-rules")!.copies.olko!.path, path.join("/o", "skills/workflow/olko-design-rules"));
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
