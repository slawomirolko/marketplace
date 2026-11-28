// Sanitize gate for content that leaves a project for the public marketplace.
//
// Blocks a staged directory when any file name or line contains a name derived
// from the source project (git remote owner and repository, package names,
// project directory name), or a term from private configuration: `leakTerms` and
// `forbiddenTerms` in ~/.olko-sync/targets.json (or --terms-file) and the
// comma-separated FACTORY_LEAK_TERMS environment variable. Forbidden terms never
// live in this public repository. The report names a term only by its number
// (#n), never by its value, so the gate itself cannot leak it.
//
// Usage:
//   node scripts/olko-sanitize.mjs --path <stage-dir> --project <dir> [--terms-file <json>] [--json]
// Exit codes: 0 clean, 2 blocked by a leak, 1 the script failed.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BLOCKED = 2;
const MIN_TERM_LENGTH = 4;
// Generic path and tooling words that name no project.
const GENERIC = new Set(["src", "app", "apps", "main", "master", "test", "tests", "docs", "project", "projects", "repo", "repos", "code", "packages", "service", "services", "github", "gitlab", "users", "home", "temp", "local"]);

function addTerm(terms, value) {
  if (typeof value !== "string") return;
  const term = value.trim().toLowerCase();
  if (term.length >= MIN_TERM_LENGTH && !GENERIC.has(term)) terms.add(term);
}

// "@owner/name" -> owner, name; "https://host/owner/name.git" -> owner, name.
function addNameParts(terms, value) {
  if (typeof value !== "string") return;
  addTerm(terms, value.replace(/^@/, ""));
  for (const part of value.replace(/\.git$/, "").split(/[/:@]/)) addTerm(terms, part);
}

function remoteTerms(project, terms) {
  const result = spawnSync("git", ["remote", "-v"], { cwd: project, encoding: "utf8" });
  if (result.status !== 0) return;
  for (const line of result.stdout.split("\n")) {
    const url = line.split(/\s+/)[1];
    if (!url) continue;
    const match = url.replace(/\.git$/, "").match(/[/:]([^/:]+)\/([^/]+)$/);
    if (match) {
      addTerm(terms, match[1]);
      addTerm(terms, match[2]);
    }
  }
}

function manifestTerms(project, terms) {
  const packageJson = path.join(project, "package.json");
  if (fs.existsSync(packageJson)) {
    try {
      addNameParts(terms, JSON.parse(fs.readFileSync(packageJson, "utf8")).name);
    } catch {
      // An unreadable package.json names nothing.
    }
  }
  const pyproject = path.join(project, "pyproject.toml");
  if (fs.existsSync(pyproject)) {
    const name = fs.readFileSync(pyproject, "utf8").match(/^name\s*=\s*["']([^"']+)["']/m);
    if (name) addTerm(terms, name[1]);
  }
  for (const entry of fs.readdirSync(project, { withFileTypes: true })) {
    if (entry.isFile() && /\.(sln|csproj)$/i.test(entry.name)) {
      for (const part of entry.name.replace(/\.(sln|csproj)$/i, "").split(".")) addTerm(terms, part);
    }
  }
}

function environmentTerms(terms) {
  for (const term of (process.env.FACTORY_LEAK_TERMS ?? "").split(",")) addTerm(terms, term);
}

function configuredTerms(termsFile, terms) {
  const file = termsFile ?? path.join(process.env.OLKO_SYNC_HOME ?? path.join(os.homedir(), ".olko-sync"), "targets.json");
  if (!fs.existsSync(file)) {
    if (termsFile) throw new Error("The given --terms-file does not exist");
    return;
  }
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const term of [...(config.leakTerms ?? []), ...(config.forbiddenTerms ?? [])]) addTerm(terms, term);
  for (const target of Object.values(config.targets ?? {})) {
    if (typeof target?.path === "string") addTerm(terms, path.basename(target.path));
  }
}

export function collectTerms(project, termsFile) {
  const terms = new Set();
  addTerm(terms, path.basename(path.resolve(project)));
  remoteTerms(project, terms);
  manifestTerms(project, terms);
  configuredTerms(termsFile, terms);
  environmentTerms(terms);
  // Longest first, so a hit reports the most specific term.
  return [...terms].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function stagedFiles(stage) {
  return fs.readdirSync(stage, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(stage, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join("/"))
    .sort();
}

export function scan(stage, project, termsFile) {
  const terms = collectTerms(project, termsFile);
  const hits = [];
  const check = (file, line, text) => {
    const lower = text.toLowerCase();
    terms.forEach((term, index) => {
      if (lower.includes(term)) hits.push({ file, line, term: `#${index + 1}` });
    });
  };
  for (const file of stagedFiles(stage)) {
    check(file, 0, file);
    const buffer = fs.readFileSync(path.join(stage, file));
    if (buffer.includes(0)) continue;
    buffer.toString("utf8").replace(/\r\n/g, "\n").split("\n").forEach((text, index) => check(file, index + 1, text));
  }
  return { clean: hits.length === 0, hits };
}

function parseArgs(argv) {
  const options = {};
  const flags = { "--path": "stage", "--project": "project", "--terms-file": "termsFile" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (flags[argument]) options[flags[argument]] = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.stage || !options.project) throw new Error("Usage: --path <stage-dir> --project <dir> [--terms-file <json>] [--json]");
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = scan(path.resolve(options.stage), path.resolve(options.project), options.termsFile);
  console.log(options.json ? JSON.stringify(report) : report.clean ? "clean" : `blocked: ${report.hits.length} hit(s)`);
  if (!report.clean) process.exitCode = BLOCKED;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    // Never echo input values: an error message could contain a term.
    console.error(`sanitize failed: ${error.message}`);
    process.exitCode = 1;
  }
}
