import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const registryPath = path.join(root, "registry.json");
const searchIndexPath = path.join(root, "search-index.json");

function usage() {
  console.error("Usage: node scripts/search-index.mjs [--fix]");
}

export function tokenize(value) {
  return [
    ...new Set(
      String(value)
        .toLowerCase()
        .split(/[^a-z0-9.]+/)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  ];
}

export function buildSearchIndex(registry) {
  return {
    schemaVersion: 1,
    skills: registry.skills.map((entry) => {
      const text = [
        entry.name,
        entry.category,
        entry.description,
        ...(entry.tags ?? []),
        ...(entry.capabilities ?? []),
      ]
        .filter(Boolean)
        .join(" ");

      return {
        name: entry.name,
        category: entry.category,
        text,
        tokens: tokenize(text),
      };
    }),
  };
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function validateSearchIndex(registry, filePath = searchIndexPath) {
  if (!fs.existsSync(filePath)) {
    return ["search-index.json: search index is missing"];
  }

  const actual = readJson(filePath);
  const expected = buildSearchIndex(registry);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return ["search-index.json: search index is stale"];
  }

  return [];
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    usage();
    return;
  }

  const fix = args.includes("--fix");
  const unknown = args.filter((arg) => !["--fix"].includes(arg));
  if (unknown.length > 0) {
    usage();
    process.exitCode = 1;
    return;
  }

  const registry = readJson(registryPath);
  if (fix) {
    writeJson(searchIndexPath, buildSearchIndex(registry));
  }

  const errors = validateSearchIndex(registry);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`search index ok: ${registry.skills.length} skills`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
