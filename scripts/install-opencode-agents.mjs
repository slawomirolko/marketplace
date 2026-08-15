import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = path.resolve(scriptsDir, "..");
const agentsRoot = path.join(marketplaceRoot, "agents", "opencode");
const manifestPath = path.join(agentsRoot, "index.json");
const registryPath = path.join(marketplaceRoot, "registry.json");
const memoryPlugin = "opencode-agent-memory@0.2.0";

function usage() {
  console.error("Usage: node scripts/install-opencode-agents.mjs --project <path> [--agent <name>] [--force]");
}

function parseArgs(args) {
  const result = { agents: [], force: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--project") {
      result.project = args[++index];
    } else if (argument === "--agent") {
      result.agents.push(args[++index]);
    } else if (argument === "--force") {
      result.force = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!result.project) {
    throw new Error("Missing required --project <path>");
  }

  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateManifest(manifest, registry) {
  if (manifest.schemaVersion !== 2 || manifest.opencodeAgentFormat !== "v1") {
    throw new Error("Unsupported OpenCode agent manifest format");
  }
  if (!Array.isArray(manifest.agents) || manifest.agents.length === 0) {
    throw new Error("OpenCode agent manifest must contain at least one agent");
  }

  const registrySkills = new Set(registry.skills.map((skill) => skill.name));
  const names = new Set();
  const files = new Set();
  const semVer = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  const roles = new Set(["auditor", "bootstrapper", "comparator", "implementer", "investigator", "orchestrator", "test-runner", "writer"]);
  const stacks = new Set(["army-python", "cross-stack", "dotnet", "mobile"]);

  for (const agent of manifest.agents) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(agent.name) || names.has(agent.name)) {
      throw new Error(`Invalid or duplicate OpenCode agent name: ${agent.name}`);
    }
    if (typeof agent.version !== "string" || !semVer.test(agent.version)) {
      throw new Error(`Invalid SemVer version for ${agent.name}`);
    }
    if (typeof agent.file !== "string" || path.basename(agent.file) !== agent.file || !agent.file.endsWith(".md") || files.has(agent.file)) {
      throw new Error(`Invalid or duplicate agent file for ${agent.name}`);
    }
    if (!roles.has(agent.role) || !stacks.has(agent.stack)) {
      throw new Error(`Invalid role or stack for ${agent.name}`);
    }
    if (
      !Array.isArray(agent.skills)
      || new Set(agent.skills).size !== agent.skills.length
      || (agent.role !== "comparator" && agent.skills.length === 0)
    ) {
      throw new Error(`Invalid skill list for ${agent.name}`);
    }
    if (!fs.existsSync(path.join(agentsRoot, agent.file))) {
      throw new Error(`Missing agent definition for ${agent.name}: ${agent.file}`);
    }
    for (const skillName of agent.skills) {
      if (!registrySkills.has(skillName)) {
        throw new Error(`${agent.name}: missing skill in registry: ${skillName}`);
      }
    }

    names.add(agent.name);
    files.add(agent.file);
  }

  for (const agent of manifest.agents) {
    if (agent.delegates === undefined) {
      continue;
    }
    if (!Array.isArray(agent.delegates) || new Set(agent.delegates).size !== agent.delegates.length) {
      throw new Error(`Invalid delegate list for ${agent.name}`);
    }
    for (const delegate of agent.delegates) {
      if (typeof delegate !== "string" || delegate === agent.name || !names.has(delegate)) {
        throw new Error(`${agent.name}: invalid delegate agent: ${delegate}`);
      }
    }
  }
}

function resolveSelectedAgents(manifest, requested) {
  const byName = new Map(manifest.agents.map((agent) => [agent.name, agent]));
  const selected = [];
  const selectedNames = new Set();
  const visiting = new Set();

  function visit(name) {
    const agent = byName.get(name);
    if (!agent) {
      throw new Error(`Unknown OpenCode agent: ${name}`);
    }
    if (visiting.has(name)) {
      throw new Error(`Cyclic OpenCode agent delegation: ${name}`);
    }
    if (selectedNames.has(name)) {
      return;
    }

    visiting.add(name);
    for (const delegate of agent.delegates ?? []) {
      visit(delegate);
    }
    visiting.delete(name);
    selectedNames.add(name);
    selected.push(agent);
  }

  for (const name of requested) {
    visit(name);
  }
  return selected;
}

function copyFile(source, target, force) {
  if (fs.existsSync(target) && !force) {
    if (fs.readFileSync(source, "utf8") === fs.readFileSync(target, "utf8")) {
      return "unchanged";
    }

    throw new Error(`Refusing to overwrite ${target}. Re-run with --force.`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return "installed";
}

function copySkill(source, target, force) {
  if (fs.existsSync(target) && !force) {
    return "present";
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
  return "installed";
}

function enableMemory(projectRoot, agents) {
  const memoryAgents = agents.filter(
    (agent) => agent.name.endsWith("-auditor") || agent.name === "olko-marketplace-skill-sync-manager",
  );
  if (memoryAgents.length === 0) {
    return;
  }

  const configPath = path.join(projectRoot, "opencode.json");
  const config = fs.existsSync(configPath) ? readJson(configPath) : { $schema: "https://opencode.ai/config.json" };
  if (config.plugin === undefined) {
    config.plugin = [];
  }
  if (!Array.isArray(config.plugin)) {
    throw new Error(`${configPath}: plugin must be an array`);
  }
  if (!config.plugin.includes(memoryPlugin)) {
    config.plugin.push(memoryPlugin);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`memory plugin ${memoryPlugin} enabled`);
  }

  for (const agent of memoryAgents) {
    const memoryPath = path.join(projectRoot, ".opencode", "memory", `${agent.name}.md`);
    if (fs.existsSync(memoryPath)) {
      continue;
    }

    fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
    fs.writeFileSync(
      memoryPath,
      [
        "---",
        `label: ${agent.name}`,
        `description: Verified, durable knowledge for the ${agent.name} agent.`,
        "limit: 5000",
        "---",
        "",
        agent.name === "olko-marketplace-skill-sync-manager"
          ? "Store only verified synchronization decisions, versioning conventions, installer constraints, project workflow rules, and version-keyed rejected new-artifact candidates."
          : "Store only verified architecture rules, test conventions, and project constraints.",
        "",
      ].join("\n"),
    );
    console.log(`memory block ${agent.name} initialized`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(args.project);
  if (!fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`Project directory does not exist: ${projectRoot}`);
  }

  const manifest = readJson(manifestPath);
  const registry = readJson(registryPath);
  validateManifest(manifest, registry);
  const skills = new Map(registry.skills.map((skill) => [skill.name, skill]));
  const requested = args.agents.length === 0 ? manifest.agents.map((agent) => agent.name) : args.agents;
  const selected = resolveSelectedAgents(manifest, requested);

  enableMemory(projectRoot, selected);

  for (const agent of selected) {
    const sourceAgent = path.join(agentsRoot, agent.file);
    const targetAgent = path.join(projectRoot, ".opencode", "agents", agent.file);
    const agentStatus = copyFile(sourceAgent, targetAgent, args.force);
    console.log(`${agent.name}: agent ${agentStatus}`);

    for (const skillName of agent.skills) {
      const skill = skills.get(skillName);
      if (!skill) {
        throw new Error(`${agent.name}: missing skill in registry: ${skillName}`);
      }

      const sourceSkill = path.join(marketplaceRoot, "skills", skill.category, skill.name);
      const targetSkill = path.join(projectRoot, ".agents", "skills", skill.name);
      const skillStatus = copySkill(sourceSkill, targetSkill, args.force);
      console.log(`${agent.name}: skill ${skillName} ${skillStatus}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  usage();
  process.exitCode = 1;
}
