import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const marketplaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(marketplaceRoot, "plugins", "olko-sync");
const pluginName = "olko-sync";
const stateScript = '${CLAUDE_PLUGIN_ROOT}/skills/olko-sync-state/scripts/sync-state.mjs';

const skills = ["olko-sync-state", "olko-port-claude-to-opencode", "olko-port-opencode-to-claude", "olko-skill-consolidator"];
const workers = [
  "olko-claude-sync-inventory",
  "olko-claude-sync-matcher",
  "olko-claude-sync-comparator",
  "olko-claude-sync-porter",
  "olko-claude-consolidation-analyst",
];
const preloaded = {
  "olko-claude-sync-manager": skills,
  "olko-claude-sync-inventory": ["olko-sync-state"],
  "olko-claude-sync-matcher": [],
  "olko-claude-sync-comparator": ["olko-sync-state"],
  "olko-claude-sync-porter": ["olko-port-claude-to-opencode", "olko-port-opencode-to-claude", "olko-sync-state"],
  "olko-claude-consolidation-analyst": [],
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readAgent(name) {
  return fs.readFileSync(path.join(pluginRoot, "agents", `${name}.md`), "utf8").replace(/\r\n/g, "\n");
}

function frontmatter(text) {
  return text.match(/^---\n([\s\S]*?)\n---\n/)[1];
}

function listField(text, field) {
  const block = frontmatter(text).match(new RegExp(`^${field}:\\n((?:  - .+\\n?)*)`, "m"));
  return block ? block[1].trim().split("\n").map((line) => line.replace(/^\s*- /, "").trim()) : [];
}

function tools(text) {
  return frontmatter(text).match(/^tools: (.+)$/m)[1].split(", ");
}

test("marketplace lists the olko-sync plugin by relative path", () => {
  const marketplace = readJson(path.join(marketplaceRoot, ".claude-plugin", "marketplace.json"));
  const entry = marketplace.plugins.find((plugin) => plugin.name === pluginName);

  assert.ok(marketplace.name && marketplace.owner?.name);
  assert.equal(entry.source, "./plugins/olko-sync");

  const manifest = readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"));
  assert.equal(manifest.name, pluginName);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("plugin holds exactly its agents and skills", () => {
  const agentFiles = fs.readdirSync(path.join(pluginRoot, "agents")).sort();
  assert.deepEqual(agentFiles, Object.keys(preloaded).map((name) => `${name}.md`).sort());

  for (const name of Object.keys(preloaded)) {
    assert.match(frontmatter(readAgent(name)), new RegExp(`^name: ${name}$`, "m"));
  }
  for (const skill of skills) {
    const text = fs.readFileSync(path.join(pluginRoot, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, new RegExp(`^name: ${skill}$`, "m"));
  }
  assert.ok(fs.existsSync(path.join(pluginRoot, "skills", "olko-sync-state", "scripts", "sync-state.mjs")));
});

test("plugin skills stay out of the Olko registry", () => {
  const registry = readJson(path.join(marketplaceRoot, "registry.json"));
  const names = new Set((registry.skills ?? registry).map((entry) => entry.name));
  for (const skill of skills) {
    assert.ok(!names.has(skill), skill);
    assert.ok(!fs.existsSync(path.join(marketplaceRoot, "skills", "marketplace", skill)), skill);
  }
});

test("agents preload namespaced skills and have no Skill tool", () => {
  for (const [name, expected] of Object.entries(preloaded)) {
    const agent = readAgent(name);
    assert.deepEqual(listField(agent, "skills"), expected.map((skill) => `${pluginName}:${skill}`), name);
    assert.ok(!tools(agent).includes("Skill"), `${name} must not load other skills`);
  }
});

test("agents that run the state script use the plugin path", () => {
  for (const name of Object.keys(preloaded)) {
    const agent = readAgent(name);
    assert.doesNotMatch(agent, /<olko-sync-state>/, name);
    if (/sync-state\.mjs/.test(agent)) {
      assert.ok(agent.includes(stateScript), name);
    }
  }
  for (const skill of skills) {
    const text = fs.readFileSync(path.join(pluginRoot, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(text, /<olko-sync-state>/, skill);
  }
});

test("manager keeps its gates and stays isolated", () => {
  const manager = readAgent("olko-claude-sync-manager");

  assert.match(manager, /^model: sonnet$/m);
  assert.deepEqual(tools(manager), ["Agent", "Read", "Write", "Edit", "Grep", "Glob", "Bash", "AskUserQuestion"]);
  assert.match(manager, /\| `target` \| .* \| never \|/);
  assert.match(manager, /Never push to `main`, never force-push, never skip hooks/);
  assert.match(manager, /never modify one/);
  assert.match(manager, /`olko-sync:<delegate>`/);
  assert.match(manager, /single message/);
  assert.match(manager, /At most 10 workers per wave/);
  assert.match(manager, /exclusion check/);
  assert.doesNotMatch(manager, /olko-adapt-to-marketplace|olko-commit|olko-marketplace-skill-sync/);
});

test("every worker runs on Haiku 5.5 and cannot spawn agents, ask the user, or edit", () => {
  for (const worker of workers) {
    const agent = readAgent(worker);
    const allowed = tools(agent);
    assert.match(frontmatter(agent), /^model: claude-haiku-5-5$/m, worker);
    for (const forbidden of ["Agent", "AskUserQuestion", "Edit", "Skill"]) {
      assert.ok(!allowed.includes(forbidden), `${worker} must not have ${forbidden}`);
    }
  }
  for (const readOnly of ["olko-claude-sync-inventory", "olko-claude-sync-comparator", "olko-claude-sync-matcher", "olko-claude-consolidation-analyst"]) {
    assert.ok(!tools(readAgent(readOnly)).includes("Write"), readOnly);
    assert.match(readAgent(readOnly), /^Read-only\./m);
  }
  assert.match(readAgent("olko-claude-sync-porter"), /Write only inside the stage directory/);
});
