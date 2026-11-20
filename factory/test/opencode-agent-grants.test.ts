// Every OpenCode agent's manifest entry (agents/opencode/index.json) declares
// exactly the delegates and skills its frontmatter permission allows, and every
// declared skill is registered. Frontmatter is parsed structurally with the
// `yaml` package: a line-regex parser silently drops the last entry of a
// permission map.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

interface ManifestAgent {
  name: string;
  file: string;
  skills?: string[];
  delegates?: string[];
}

type Grant = { form: "absent" | "map" | string; names: string[] };

const marketplaceRoot = path.resolve(import.meta.dirname, "..", "..");
const agentsRoot = path.join(marketplaceRoot, "agents", "opencode");
const manifest = JSON.parse(fs.readFileSync(path.join(agentsRoot, "index.json"), "utf8")) as { agents: ManifestAgent[] };
const registry = JSON.parse(fs.readFileSync(path.join(marketplaceRoot, "registry.json"), "utf8")) as { skills: { name: string }[] };
const registrySkills = new Set(registry.skills.map((skill) => skill.name));

function frontmatter(file: string): Record<string, unknown> {
  const lines = fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  assert.equal(lines[0]?.trim(), "---", `${file} is missing YAML frontmatter`);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(end > 0, `${file} has unterminated YAML frontmatter`);
  return (parse(lines.slice(1, end).join("\n")) as Record<string, unknown> | null) ?? {};
}

function grant(permission: Record<string, unknown>, key: string): Grant {
  const block = permission[key];
  if (block == null) return { form: "absent", names: [] };
  if (typeof block === "string") return { form: block, names: [] };
  assert.equal(typeof block, "object", `permission.${key} must be a map or a string`);
  const names = Object.entries(block as Record<string, unknown>)
    .filter(([name, value]) => name !== "*" && value === "allow")
    .map(([name]) => name);
  return { form: "map", names };
}

function compare(agent: ManifestAgent, key: "task" | "skill", declared: string[]): void {
  const permission = (frontmatter(path.join(agentsRoot, agent.file)).permission ?? {}) as Record<string, unknown>;
  const allowedGrant = grant(permission, key);
  // A whole-map `allow` string cannot enumerate names, so there is no set to compare.
  if (allowedGrant.form === "allow") return;
  const allowed = new Set(allowedGrant.names);
  const declaredSet = new Set(declared);
  const missing = [...allowed].filter((name) => !declaredSet.has(name)).sort();
  const extra = [...declaredSet].filter((name) => !allowed.has(name)).sort();
  assert.deepEqual(missing, [], `${agent.name}: permission.${key} allows ${missing.join(", ")} but the manifest declares no such entry`);
  assert.deepEqual(extra, [], `${agent.name}: the manifest declares ${extra.join(", ")} but permission.${key} does not allow it`);
}

for (const agent of manifest.agents) {
  test(`${agent.name}: manifest grants match its frontmatter`, () => {
    compare(agent, "task", agent.delegates ?? []);
    compare(agent, "skill", agent.skills ?? []);
  });

  test(`${agent.name}: every declared skill is registered`, () => {
    const unregistered = (agent.skills ?? []).filter((skill) => !registrySkills.has(skill));
    assert.deepEqual(unregistered, [], `${agent.name}: declares unregistered skills ${unregistered.join(", ")}`);
  });
}
