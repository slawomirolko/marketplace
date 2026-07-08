import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "registry.json");
const defaultBudget = 4000;
const defaultMaxDepth = 1;
const phaseFractions = {
  routing: 0.1,
  selection: 0.2,
  loading: 0.3,
  execution: 0.4,
};

function usage() {
  console.error(
    "Usage: node scripts/context-plan.mjs --skill <name> [--project <path>] [--budget 4000] [--max-depth 1]",
  );
}

function parseArgs(argv) {
  const args = {
    budget: defaultBudget,
    maxDepth: defaultMaxDepth,
    project: root,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--skill") {
      args.skill = argv[++index];
    } else if (token === "--project") {
      args.project = path.resolve(argv[++index]);
    } else if (token === "--budget") {
      args.budget = Number.parseInt(argv[++index], 10);
    } else if (token === "--max-depth") {
      args.maxDepth = Number.parseInt(argv[++index], 10);
    } else if (token === "--help") {
      args.help = true;
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
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

function declaredUses(projectRoot, skillName) {
  const filePath = adapterPath(projectRoot, skillName);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return parseUses(fs.readFileSync(filePath, "utf8"));
}

function resolveUses(projectRoot, skillName, knownSkills, maxDepth, stack = []) {
  if (stack.includes(skillName)) {
    throw new Error(`Cycle detected in uses: ${[...stack, skillName].join(" -> ")}`);
  }

  if (stack.length >= maxDepth) {
    return [];
  }

  const resolved = [];
  for (const dependency of declaredUses(projectRoot, skillName)) {
    if (!knownSkills.has(dependency)) {
      throw new Error(`${skillName}: declared uses entry does not exist in registry: ${dependency}`);
    }

    resolved.push({
      name: dependency,
      declaredBy: skillName,
      depth: stack.length + 1,
    });

    resolved.push(...resolveUses(projectRoot, dependency, knownSkills, maxDepth, [...stack, skillName]));
  }

  return resolved;
}

function uniqueByName(dependencies) {
  const seen = new Set();
  return dependencies.filter((dependency) => {
    if (seen.has(dependency.name)) {
      return false;
    }
    seen.add(dependency.name);
    return true;
  });
}

function phaseBudgets(totalBudget) {
  return Object.fromEntries(
    Object.entries(phaseFractions).map(([phase, fraction]) => [phase, Math.floor(totalBudget * fraction)]),
  );
}

function firstLoadFile(entry) {
  return entry.loading?.first ?? "SKILL.md";
}

function executionFiles(entry, role) {
  if (role === "support") {
    return [firstLoadFile(entry)];
  }

  if (entry.loading?.mode === "progressive") {
    return ["SKILL.md", firstLoadFile(entry), "workflow.md"].filter((file, index, files) => files.indexOf(file) === index);
  }

  return ["SKILL.md"];
}

function contextPlanFor(entry, role) {
  return {
    name: entry.name,
    role,
    routing: {
      load: ["name", "category", "description", "tags", "capabilities", "cost", "loading"],
      mode: "metadata-only",
    },
    selection: {
      load: [firstLoadFile(entry)],
      mode: entry.loading?.mode ?? "single",
    },
    execution: {
      load: executionFiles(entry, role),
      trimFirst: ["examples.md", "edge-cases.md", "references/*"],
      preserve: ["decisions", "outputs", "openIssues", "filePaths"],
    },
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.skill) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (!Number.isInteger(args.budget) || args.budget < 1000) {
  console.error("--budget must be an integer >= 1000");
  process.exit(1);
}

if (!Number.isInteger(args.maxDepth) || args.maxDepth < 0 || args.maxDepth > 3) {
  console.error("--max-depth must be an integer from 0 to 3");
  process.exit(1);
}

const registry = readJson(registryPath);
const skills = new Map(registry.skills.map((entry) => [entry.name, entry]));
if (!skills.has(args.skill)) {
  console.error(`Unknown skill: ${args.skill}`);
  process.exit(1);
}

let dependencies;
try {
  dependencies = uniqueByName(resolveUses(args.project, args.skill, skills, args.maxDepth));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const active = skills.get(args.skill);
const support = dependencies.map((dependency) => ({
  ...dependency,
  entry: skills.get(dependency.name),
}));

console.log(
  JSON.stringify(
    {
      skill: args.skill,
      project: normalizeSlashes(args.project),
      totalBudget: args.budget,
      phaseBudgets: phaseBudgets(args.budget),
      composition: {
        allowed: support.length > 0,
        maxDepth: args.maxDepth,
        dependencies: support.map(({ name, declaredBy, depth }) => ({ name, declaredBy, depth })),
      },
      loadPlan: [contextPlanFor(active, "primary"), ...support.map(({ entry }) => contextPlanFor(entry, "support"))],
      compression: {
        prefer: "summaries-over-raw-context",
        summarizeCompletedRunsAs: ["decision", "reason", "loaded", "output", "openIssue"],
        dropUnlessDebugging: ["fullHistory", "fullToolLogs", "unusedCandidates"],
      },
    },
    null,
    2,
  ),
);
