import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "./search-index.mjs";

const root = process.cwd();
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const routeScriptPath = path.join(scriptsDir, "route-skill.mjs");
const contextPlanScriptPath = path.join(scriptsDir, "context-plan.mjs");
const registryPath = path.join(root, "registry.json");

function usage() {
  console.error(
    "Usage: node scripts/skill-execution-plan.mjs --intent <text> --project <path> [--category <name>] [--budget 4000] [--limit 5]",
  );
}

function parseArgs(argv) {
  const args = {
    budget: 4000,
    limit: 5,
    project: root,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--intent") {
      args.intent = argv[++index];
    } else if (token === "--project") {
      args.project = path.resolve(argv[++index]);
    } else if (token === "--category") {
      args.category = argv[++index];
    } else if (token === "--budget") {
      args.budget = Number.parseInt(argv[++index], 10);
    } else if (token === "--limit") {
      args.limit = Number.parseInt(argv[++index], 10);
    } else if (token === "--help") {
      args.help = true;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseScalar(value) {
  const trimmed = value.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  return trimmed;
}

function parseSkillConfig(markdown) {
  const config = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_.-]*):\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }
    config[match[1]] = parseScalar(match[2]);
  }
  return config;
}

function readProjectConfig(projectRoot) {
  const filePath = path.join(projectRoot, ".agents", "skill-config.md");
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return parseSkillConfig(fs.readFileSync(filePath, "utf8"));
}

function projectAdapterEnabled(projectConfig) {
  return projectConfig.projectAdapter !== false;
}

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
}

function runJson(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim());
  }

  return JSON.parse(result.stdout);
}

function parseUses(markdown) {
  const lines = markdown.split(/\r?\n/);
  const uses = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inline = line.match(/^uses:\s*\[(.*)\]\s*$/);
    if (inline) {
      return inline[1]
        .split(",")
        .map((value) => value.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }

    if (/^uses:\s*$/.test(line)) {
      index += 1;
      while (index < lines.length) {
        const item = lines[index].match(/^\s*-\s*([^#\s].*?)\s*$/);
        if (!item) {
          break;
        }
        uses.push(item[1].replace(/^["']|["']$/g, "").trim());
        index += 1;
      }
      return uses;
    }
  }

  return uses;
}

function adapterPath(projectRoot, skillName) {
  return path.join(projectRoot, ".agents", "skills", skillName, "project.md");
}

function declaredUses(projectRoot, skillName, projectConfig) {
  if (!projectAdapterEnabled(projectConfig)) {
    return [];
  }

  const filePath = adapterPath(projectRoot, skillName);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return parseUses(fs.readFileSync(filePath, "utf8"));
}

function parseRequirement(value) {
  const match = String(value).match(/^([^@\s]+)(?:@(.+))?$/);
  return {
    name: match?.[1] ?? value,
    range: match?.[2] ?? null,
  };
}

function versionMatches(version, range) {
  if (!range) {
    return true;
  }
  if (range.startsWith("^")) {
    return version.split(".")[0] === range.slice(1).split(".")[0];
  }
  return version === range;
}

function validateDependencies(selectedEntries, registrySkills) {
  const errors = [];
  const selected = new Map(selectedEntries.map((entry) => [entry.name, entry]));
  const requirementsByPeer = new Map();

  for (const entry of selectedEntries) {
    for (const field of ["requires", "compatibleWith"]) {
      for (const raw of entry[field] ?? []) {
        const requirement = parseRequirement(raw);
        const peer = registrySkills.get(requirement.name);
        if (!peer) {
          errors.push(`${entry.name}: ${field} references missing skill: ${requirement.name}`);
          continue;
        }

        if (field === "requires" && !selected.has(requirement.name)) {
          errors.push(`${entry.name}: required skill is not selected via explicit uses: ${requirement.name}`);
        }

        if (!versionMatches(peer.version, requirement.range)) {
          errors.push(`${entry.name}: ${requirement.name}@${peer.version} does not satisfy ${requirement.range}`);
        }

        if (requirement.range) {
          if (!requirementsByPeer.has(requirement.name)) {
            requirementsByPeer.set(requirement.name, []);
          }
          requirementsByPeer.get(requirement.name).push({ by: entry.name, range: requirement.range });
        }
      }
    }
  }

  for (const [peerName, requirements] of requirementsByPeer) {
    const ranges = [...new Set(requirements.map((requirement) => requirement.range))];
    if (ranges.length > 1) {
      errors.push(
        `${peerName}: incompatible peer requirements: ${requirements
          .map((requirement) => `${requirement.by} requires ${requirement.range}`)
          .join(", ")}`,
      );
    }
  }

  return errors;
}

function headingExamples(markdown, intentTokens) {
  const examples = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const title = match[1].trim();
    const tags = tokenize(title);
    const matchedTokens = tags.filter((tag) => intentTokens.includes(tag));
    if (matchedTokens.length === 0) {
      continue;
    }
    examples.push({
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      file: "examples.md",
      title,
      tags,
      matchedTokens,
    });
  }

  return examples;
}

function indexedExamples(skillDir, intentTokens) {
  const indexPath = path.join(skillDir, "examples.index.json");
  if (fs.existsSync(indexPath)) {
    return readJson(indexPath).examples
      .map((example) => ({
        ...example,
        matchedTokens: (example.tags ?? []).filter((tag) => intentTokens.includes(tag)),
      }))
      .filter((example) => example.matchedTokens.length > 0);
  }

  const examplesPath = path.join(skillDir, "examples.md");
  if (!fs.existsSync(examplesPath)) {
    return [];
  }

  return headingExamples(fs.readFileSync(examplesPath, "utf8"), intentTokens);
}

function selectedExamples(entry, intent) {
  const skillDir = path.join(root, "skills", entry.category, entry.name);
  const intentTokens = tokenize(intent);
  return indexedExamples(skillDir, intentTokens).slice(0, 3);
}

export function planParallelWork(tasks) {
  const owners = new Map();
  const conflicts = [];

  for (const task of tasks) {
    for (const owned of task.owns ?? []) {
      if (owners.has(owned)) {
        conflicts.push({
          file: owned,
          tasks: [owners.get(owned), task.id],
        });
      } else {
        owners.set(owned, task.id);
      }
    }
  }

  const conflictTasks = new Set(conflicts.flatMap((conflict) => conflict.tasks));
  return {
    allowed: conflicts.length === 0 && tasks.some((task) => task.canRunInParallel),
    criticalPath: tasks.find((task) => task.blocks?.length > 0 || task.blocksOn?.length > 0)?.id ?? tasks[0]?.id ?? null,
    conflicts,
    tasks: tasks.map((task) => ({
      ...task,
      canRunInParallel: Boolean(task.canRunInParallel) && !conflictTasks.has(task.id),
    })),
  };
}

function defaultParallelWork(selected) {
  return planParallelWork([
    {
      id: "route-skill",
      title: "Route intent to primary skill",
      canRunInParallel: false,
      owns: [],
      blocks: ["build-context-plan"],
      blocksOn: [],
      risk: "low",
    },
    {
      id: "build-context-plan",
      title: "Resolve context and explicit uses",
      canRunInParallel: false,
      owns: [],
      blocks: ["execute-primary-skill"],
      blocksOn: ["route-skill"],
      risk: "medium",
    },
    {
      id: "execute-primary-skill",
      title: `Execute ${selected.name}`,
      canRunInParallel: false,
      owns: [],
      blocks: [],
      blocksOn: ["build-context-plan"],
      risk: "medium",
    },
  ]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.intent) {
    usage();
    process.exit(args.help ? 0 : 1);
    return;
  }

  if (!Number.isInteger(args.budget) || args.budget < 1000) {
    console.error("--budget must be an integer >= 1000");
    process.exit(1);
    return;
  }

  const routeArgs = ["--intent", args.intent, "--limit", String(args.limit)];
  if (args.category) {
    routeArgs.push("--category", args.category);
  }
  const routing = runJson(routeScriptPath, routeArgs);
  const selected = routing.candidates[0];
  if (!selected) {
    throw new Error("No skill candidates matched intent");
  }

  const contextArgs = ["--skill", selected.name, "--project", args.project, "--budget", String(args.budget)];
  const examples = selectedExamples(selected, args.intent);
  if (examples.length > 0) {
    contextArgs.push("--include-examples");
  }
  const contextPlan = runJson(contextPlanScriptPath, contextArgs);
  const projectConfig = readProjectConfig(args.project);

  const registry = readJson(registryPath);
  const registrySkills = new Map(registry.skills.map((entry) => [entry.name, entry]));
  const selectedEntries = [
    registrySkills.get(selected.name),
    ...contextPlan.composition.dependencies.map((dependency) => registrySkills.get(dependency.name)),
  ].filter(Boolean);
  const dependencyErrors = validateDependencies(selectedEntries, registrySkills);
  if (dependencyErrors.length > 0) {
    throw new Error(dependencyErrors.join("\n"));
  }

  const compressionFiles = {
    scratchpad: normalizeSlashes(path.join(args.project, ".agents", "context", "scratchpad", "current.json")),
    summary: normalizeSlashes(path.join(args.project, ".agents", "context", "summaries", "latest.md")),
    memory: normalizeSlashes(path.join(args.project, ".agents", "context", "memory", `${selected.name}.md`)),
  };

  console.log(
    JSON.stringify(
      {
        intent: args.intent,
        project: normalizeSlashes(args.project),
        routedCandidates: routing.candidates,
        selectedPrimarySkill: {
          name: selected.name,
          confidence: selected.confidence,
          reasons: selected.reasons,
        },
        explicitUses: {
          adapter: normalizeSlashes(adapterPath(args.project, selected.name)),
          dependencies: contextPlan.composition.dependencies,
          declaredUses: declaredUses(args.project, selected.name, projectConfig),
        },
        adaptation: contextPlan.adaptation,
        context: {
          sourceBudgets: contextPlan.sourceBudgets,
          phaseBudgets: contextPlan.phaseBudgets,
          loadPlan: contextPlan.loadPlan,
        },
        selectedExamples: examples,
        compressionFiles,
        compression: contextPlan.compression,
        parallelWork: defaultParallelWork(selected),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
