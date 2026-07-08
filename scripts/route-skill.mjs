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
  const reasons = [];
  const tagMatches = entry.tags.filter((tag) => {
    const matched = intentTokens.has(tag);
    if (matched) {
      reasons.push(`tag match: ${tag}`);
    }
    return matched;
  }).length;
  const capabilityMatches = entry.capabilities.filter((capability) => {
    const parts = capability.split(".");
    const matched = intentTokens.has(capability) || parts.some((part) => intentTokens.has(part));
    if (matched) {
      reasons.push(`capability match: ${capability}`);
    }
    return matched;
  }).length;
  const descriptionTokens = tokenize(entry.description);
  const descriptionMatches = [...intentTokens].filter((token) => {
    const matched = descriptionTokens.has(token);
    if (matched) {
      reasons.push(`description match: ${token}`);
    }
    return matched;
  }).length;
  const nameTokens = tokenize(entry.name);
  const nameMatches = nameTokens.size > 0 && [...nameTokens].some((token) => intentTokens.has(token)) ? 1 : 0;
  if (nameMatches > 0) {
    reasons.push(`name match: ${entry.name}`);
  }

  return {
    score: tagMatches * 4 + capabilityMatches * 3 + nameMatches * 2 + descriptionMatches,
    reasons,
  };
}

function confidenceFor(candidate, index, candidates) {
  if (candidate.score < 4) {
    return "low";
  }

  const next = candidates[index + 1];
  const lead = next ? candidate.score - next.score : candidate.score;
  if (candidate.score >= 8 && lead >= 3) {
    return "high";
  }

  if (candidate.score >= 4) {
    return "medium";
  }

  return "low";
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
  .map((entry) => {
    const scored = scoreEntry(entry, intentTokens);
    return {
      name: entry.name,
      category: entry.category,
      score: scored.score,
      reasons: scored.reasons,
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
    };
  })
  .filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score || a.cost - b.cost || a.name.localeCompare(b.name))
  .slice(0, args.limit)
  .map((entry, index, entries) => ({
    ...entry,
    confidence: confidenceFor(entry, index, entries),
  }));

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
