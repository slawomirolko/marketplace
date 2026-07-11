import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "registry.json");
const defaultBudget = 4000;
const defaultMaxDepth = 1;
const defaultSourceBudgets = {
  "registry-metadata": 300,
  "category-index": 300,
  "route-candidates": 300,
  "skill-body": 1200,
  "project-adapter": 600,
  "project-adapter-source": 1000,
  "skill-memory": 600,
  "project-summary": 800,
  "project-conventions": 600,
  workflow: 1200,
  example: 600,
  "edge-case": 400,
};
const sourceScores = {
  "registry-metadata": 100,
  "category-index": 100,
  "route-candidates": 100,
  "skill-body": 100,
  "project-adapter-source": 98,
  "project-adapter": 95,
  "skill-memory": 90,
  "project-summary": 80,
  "project-conventions": 75,
  workflow: 70,
  example: 45,
  "edge-case": 35,
};
const phaseFractions = {
  routing: 0.1,
  selection: 0.2,
  loading: 0.3,
  execution: 0.4,
};

function usage() {
  console.error(
    "Usage: node scripts/context-plan.mjs --skill <name> [--project <path>] [--budget 4000] [--max-depth 1] [--include-examples] [--include-edge-cases]",
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
    } else if (token === "--include-examples") {
      args.includeExamples = true;
    } else if (token === "--include-edge-cases") {
      args.includeEdgeCases = true;
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

function normalizeSlashes(value) {
  return value.replaceAll("\\", "/");
}

function relativeProjectPath(projectRoot, filePath) {
  return normalizeSlashes(path.relative(projectRoot, filePath));
}

function sourceEntry(source, kind, required, reason) {
  return {
    source: normalizeSlashes(source),
    kind,
    required,
    score: sourceScores[kind],
    budget: defaultSourceBudgets[kind],
    reason,
  };
}

function parseListField(markdown, fieldName) {
  const lines = markdown.split(/\r?\n/);
  const values = [];
  const fieldPattern = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inline = line.match(new RegExp(`^${fieldPattern}:\\s*\\[(.*)\\]\\s*$`));
    if (inline) {
      return inline[1]
        .split(",")
        .map((value) => value.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }

    if (new RegExp(`^${fieldPattern}:\\s*$`).test(line)) {
      index += 1;
      while (index < lines.length) {
        const item = lines[index].match(/^\s*-\s*([^#\s].*?)\s*$/);
        if (!item) {
          break;
        }
        values.push(item[1].replace(/^["']|["']$/g, "").trim());
        index += 1;
      }
      return values;
    }
  }

  return values;
}

function parseUses(markdown) {
  return parseListField(markdown, "uses");
}

function adapterPath(projectRoot, skillName) {
  return path.join(projectRoot, ".agents", "skills", skillName, "project.md");
}

function projectAdapterEnabled(projectConfig) {
  return projectConfig.projectAdapter !== false;
}

function readAdapter(projectRoot, skillName, projectConfig) {
  if (!projectAdapterEnabled(projectConfig)) {
    return null;
  }

  const filePath = adapterPath(projectRoot, skillName);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return {
    filePath,
    markdown: fs.readFileSync(filePath, "utf8"),
  };
}

function declaredUses(projectRoot, skillName, projectConfig) {
  const adapter = readAdapter(projectRoot, skillName, projectConfig);
  if (!adapter) {
    return [];
  }

  return parseUses(adapter.markdown);
}

function adapterLists(projectRoot, skillName, projectConfig) {
  const adapter = readAdapter(projectRoot, skillName, projectConfig);
  if (!adapter) {
    return {
      contextSources: [],
      ownedFiles: [],
    };
  }

  return {
    contextSources: parseListField(adapter.markdown, "contextSources"),
    ownedFiles: parseListField(adapter.markdown, "ownedFiles"),
  };
}

function resolveUses(projectRoot, skillName, knownSkills, maxDepth, projectConfig, stack = []) {
  if (stack.includes(skillName)) {
    throw new Error(`Cycle detected in uses: ${[...stack, skillName].join(" -> ")}`);
  }

  if (stack.length >= maxDepth) {
    return [];
  }

  const resolved = [];
  for (const dependency of declaredUses(projectRoot, skillName, projectConfig)) {
    if (!knownSkills.has(dependency)) {
      throw new Error(`${skillName}: declared uses entry does not exist in registry: ${dependency}`);
    }

    resolved.push({
      name: dependency,
      declaredBy: skillName,
      depth: stack.length + 1,
    });

    resolved.push(...resolveUses(projectRoot, dependency, knownSkills, maxDepth, projectConfig, [...stack, skillName]));
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

function skillFile(entry, file) {
  return path.join("skills", entry.category, entry.name, file);
}

function hasSkillFile(entry, file) {
  return entry.files?.includes(file);
}

function existingSource(projectRoot, source, kind, required, reason) {
  const filePath = path.join(projectRoot, source);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  return sourceEntry(source, kind, required, reason);
}

function adapterContextSources(projectRoot, entry, projectConfig) {
  return adapterLists(projectRoot, entry.name, projectConfig).contextSources
    .map((source) =>
      existingSource(projectRoot, source, "project-adapter-source", true, "project source declared by adapter"),
    )
    .filter(Boolean);
}

function conventionSources(projectRoot) {
  return [
    existingSource(projectRoot, "AGENTS.md", "project-conventions", false, "project-wide agent instructions"),
    existingSource(
      projectRoot,
      path.join(".agents", "skill-config.md"),
      "project-conventions",
      false,
      "project-wide skill configuration",
    ),
  ].filter(Boolean);
}

function skillContextSources(projectRoot, entry, role, options = {}) {
  const sources = [
    sourceEntry("registry.json", "registry-metadata", true, "selected skill metadata"),
    sourceEntry(path.join("skills", entry.category, "index.json"), "category-index", true, "category index for selected skill"),
    sourceEntry("registry.json#skills", "route-candidates", true, "route candidates used before skill selection"),
    sourceEntry(skillFile(entry, "SKILL.md"), "skill-body", true, role === "primary" ? "selected SKILL.md" : "support SKILL.md"),
  ];

  if (projectAdapterEnabled(options.projectConfig ?? {})) {
    const adapter = existingSource(
      projectRoot,
      path.join(".agents", "skills", entry.name, "project.md"),
      "project-adapter",
      false,
      "project adapter for selected skill",
    );
    if (adapter) {
      sources.push(adapter);
    }
    sources.push(...adapterContextSources(projectRoot, entry, options.projectConfig ?? {}));
  }

  const memory = existingSource(
    projectRoot,
    path.join(".agents", "context", "memory", `${entry.name}.md`),
    "skill-memory",
    false,
    "project-specific memory for selected skill",
  );
  if (memory) {
    sources.push(memory);
  }

  const summary = existingSource(
    projectRoot,
    path.join(".agents", "context", "summaries", "latest.md"),
    "project-summary",
    false,
    "latest project summary",
  );
  if (summary) {
    sources.push(summary);
  }

  sources.push(...conventionSources(projectRoot));

  if (entry.loading?.mode === "progressive" && hasSkillFile(entry, "overview.md")) {
    sources.push(sourceEntry(skillFile(entry, "overview.md"), "skill-body", true, "progressive overview loads before workflow"));
  }

  if (entry.loading?.mode === "progressive" && role === "primary" && hasSkillFile(entry, "workflow.md")) {
    sources.push(sourceEntry(skillFile(entry, "workflow.md"), "workflow", true, "workflow loads after skill selection"));
  }

  if (options.includeExamples && hasSkillFile(entry, "examples.md")) {
    sources.push(sourceEntry(skillFile(entry, "examples.md"), "example", false, "selected because task or routing matched examples"));
  }

  if (options.includeEdgeCases && hasSkillFile(entry, "edge-cases.md")) {
    sources.push(sourceEntry(skillFile(entry, "edge-cases.md"), "edge-case", false, "selected because risk signals or failure handling were requested"));
  }

  return sources;
}

function contextPlanFor(entry, role, projectRoot, options = {}) {
  return {
    name: entry.name,
    role,
    sources: skillContextSources(projectRoot, entry, role, options),
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

function existingProjectContext(projectRoot, skillName) {
  const contextRoot = path.join(projectRoot, ".agents", "context");
  const candidates = [
    ["summary", path.join(contextRoot, "summaries", "latest.md")],
    ["scratchpad", path.join(contextRoot, "scratchpad", "current.json")],
    ["skillMemory", path.join(contextRoot, "memory", `${skillName}.md`)],
  ];

  return Object.fromEntries(
    candidates
      .filter(([, filePath]) => fs.existsSync(filePath))
      .map(([name, filePath]) => [name, relativeProjectPath(projectRoot, filePath)]),
  );
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

const projectConfig = readProjectConfig(args.project);
let dependencies;
try {
  dependencies = uniqueByName(resolveUses(args.project, args.skill, skills, args.maxDepth, projectConfig));
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
      sourceBudgets: defaultSourceBudgets,
      adaptation: {
        projectAdapter: projectAdapterEnabled(projectConfig),
        ownedFiles: adapterLists(args.project, args.skill, projectConfig).ownedFiles,
      },
      composition: {
        allowed: support.length > 0,
        maxDepth: args.maxDepth,
        dependencies: support.map(({ name, declaredBy, depth }) => ({ name, declaredBy, depth })),
      },
      projectContext: existingProjectContext(args.project, args.skill),
      loadPlan: [
        contextPlanFor(active, "primary", args.project, { ...args, projectConfig }),
        ...support.map(({ entry }) => contextPlanFor(entry, "support", args.project, { ...args, projectConfig })),
      ],
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
