import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = path.resolve(scriptsDir, "..");
const agentsRoot = path.join(marketplaceRoot, "agents", "opencode");
const manifest = JSON.parse(fs.readFileSync(path.join(agentsRoot, "index.json"), "utf8"));
const registry = JSON.parse(fs.readFileSync(path.join(marketplaceRoot, "registry.json"), "utf8"));
const registrySkills = new Set(registry.skills.map((skill) => skill.name));

/**
 * Frontmatter is parsed by PyYAML so grants are read structurally instead of by
 * line regex: a regex parser silently drops the last entry of a permission map.
 * Node ships no YAML parser and this repository declares no npm dependency, so
 * the parse runs in one python3 process for every agent file.
 */
const yamlScript = String.raw`
import json, sys, yaml

def frontmatter(raw, file_path):
    text = raw.lstrip("\ufeff")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise SystemExit(f"{file_path} is missing YAML frontmatter")
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            return "\n".join(lines[1:index])
    raise SystemExit(f"{file_path} has unterminated YAML frontmatter")

def grants(permission, key):
    block = permission.get(key)
    if block is None:
        return {"form": "absent", "names": []}
    if isinstance(block, str):
        return {"form": block, "names": []}
    if not isinstance(block, dict):
        raise SystemExit(f"permission.{key} must be a map or a string, got {type(block).__name__}")
    names = [name for name, value in block.items() if name != "*" and value == "allow"]
    return {"form": "map", "names": names}

result = {}
for agent in json.load(sys.stdin):
    raw = open(agent["path"], encoding="utf-8").read()
    data = yaml.safe_load(frontmatter(raw, agent["path"])) or {}
    permission = data.get("permission") or {}
    result[agent["name"]] = {"task": grants(permission, "task"), "skill": grants(permission, "skill")}
json.dump(result, sys.stdout)
`;

let cachedGrants;
function frontmatterGrants() {
  if (cachedGrants) {
    return cachedGrants;
  }
  const payload = manifest.agents.map((agent) => ({
    name: agent.name,
    path: path.join(agentsRoot, agent.file),
  }));
  const result = spawnSync("python3", ["-c", yamlScript], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `python3 with PyYAML is required to parse agent frontmatter: ${result.stderr || result.error}`,
  );
  cachedGrants = JSON.parse(result.stdout);
  return cachedGrants;
}

function compare(agent, key, declared) {
  const grant = frontmatterGrants()[agent.name][key];
  // A whole-map `allow` string cannot enumerate names, so there is no set to compare.
  if (grant.form === "allow") {
    return;
  }
  const allowed = new Set(grant.names);
  const declaredSet = new Set(declared);
  const missing = [...allowed].filter((name) => !declaredSet.has(name)).sort();
  const extra = [...declaredSet].filter((name) => !allowed.has(name)).sort();

  assert.deepEqual(
    missing,
    [],
    `${agent.name}: permission.${key} allows ${missing.join(", ")} but the manifest declares no such entry`,
  );
  assert.deepEqual(
    extra,
    [],
    `${agent.name}: the manifest declares ${extra.join(", ")} but permission.${key} does not allow it`,
  );
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
