import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillsRoot = path.join(root, "skills");
const capabilityGraphPath = path.join(root, "capability-graph.json");

function usage() {
  console.error("Usage: node scripts/route-skill.mjs --intent <text> [--category <name>] [--limit 5] [--suggest-adjacent]");
}

function parseArgs(argv) {
  const args = {
    limit: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--intent") {
      args.intent = argv[++i];
    } else if (token === "--category") {
      args.category = argv[++i];
    } else if (token === "--limit") {
      args.limit = Number.parseInt(argv[++i], 10);
    } else if (token === "--suggest-adjacent") {
      args.suggestAdjacent = true;
    } else if (token === "--help") {
      args.help = true;
    } else {
      args.intent = [args.intent, token].filter(Boolean).join(" ");
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function tokenize(value) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function loadCandidates(category) {
  if (category) {
    const indexPath = path.join(skillsRoot, category, "index.json");
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Category index not found: skills/${category}/index.json`);
    }
    return readJson(indexPath).skills;
  }

  return readJson(path.join(root, "registry.json")).skills;
}

function loadCapabilityGraph() {
  if (!fs.existsSync(capabilityGraphPath)) {
    return null;
  }

  const graph = readJson(capabilityGraphPath);
  return new Map(graph.capabilities.map((capability) => [capability.id, capability]));
}

function scoreEntry(entry, intentTokens) {
  const tagMatches = entry.tags.filter((tag) => intentTokens.has(tag)).length;
  const capabilityMatches = entry.capabilities.filter((capability) => {
    const parts = capability.split(".");
    return intentTokens.has(capability) || parts.some((part) => intentTokens.has(part));
  }).length;
  const descriptionTokens = tokenize(entry.description);
  const descriptionMatches = [...intentTokens].filter((token) => descriptionTokens.has(token)).length;
  const nameMatches = tokenize(entry.name).size > 0 && [...tokenize(entry.name)].some((token) => intentTokens.has(token)) ? 1 : 0;

  return tagMatches * 4 + capabilityMatches * 3 + nameMatches * 2 + descriptionMatches;
}

function adjacentSuggestions(entry, graph) {
  if (!graph) {
    return [];
  }

  const suggestions = new Map();
  for (const capability of entry.capabilities) {
    const node = graph.get(capability);
    if (!node) {
      continue;
    }

    for (const relatedCapability of node.related) {
      const relatedNode = graph.get(relatedCapability);
      if (!relatedNode) {
        continue;
      }

      for (const skill of relatedNode.skills) {
        if (skill !== entry.name && !suggestions.has(skill)) {
          suggestions.set(skill, {
            skill,
            capability: relatedCapability,
            reason: `related to ${capability}`,
          });
        }
      }
    }
  }

  return [...suggestions.values()].slice(0, 3);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.intent) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (!Number.isInteger(args.limit) || args.limit < 2 || args.limit > 5) {
  console.error("--limit must be an integer from 2 to 5");
  process.exit(1);
}

const intentTokens = tokenize(args.intent);
const capabilityGraph = args.suggestAdjacent ? loadCapabilityGraph() : null;
const candidates = loadCandidates(args.category)
  .map((entry) => ({
    name: entry.name,
    category: entry.category,
    score: scoreEntry(entry, intentTokens),
    cost: entry.cost,
    description: entry.description,
    tags: entry.tags,
    capabilities: entry.capabilities,
    loading: entry.loading ?? {
      mode: "single",
      first: "SKILL.md",
      sections: ["SKILL.md"],
    },
    adjacentSuggestions: args.suggestAdjacent ? adjacentSuggestions(entry, capabilityGraph) : undefined,
  }))
  .filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score || a.cost - b.cost || a.name.localeCompare(b.name))
  .slice(0, args.limit);

console.log(
  JSON.stringify(
    {
      intent: args.intent,
      category: args.category ?? null,
      candidates,
    },
    null,
    2,
  ),
);
