import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillsRoot = path.join(root, "skills");

function usage() {
  console.error("Usage: node scripts/route-skill.mjs --intent <text> [--category <name>] [--limit 5]");
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
