// Sanitize gate for content that leaves a project for the public marketplace.
//
// Blocks a staged directory when any file name or line contains a name derived
// from the source project (every non-generic git remote URL segment and host,
// the repository and worktree names, package names, the project folder name and
// the split parts of each), a term from private configuration (`leakTerms` and
// `forbiddenTerms` in ~/.olko-sync/targets.json or --terms-file, and the
// comma-separated FACTORY_LEAK_TERMS environment variable), a secret pattern,
// a binary file or a non-regular entry such as a symlink. Forbidden terms never
// live in this public repository.
//
// Matching folds Unicode (NFKC), drops zero-width characters, ignores case and
// the separators - _ . and whitespace, so "BillingPortal", "billing_portal" and
// "billing portal" all match the term "billing-portal", also inside longer words.
//
// The gate fails closed: without a remote term or a configured term it exits 1,
// unless --allow-no-config is given. Output never holds a value: a term is
// reported by its number (#n), a secret by its label, an error by a fixed code,
// and a file whose name holds a hit by its index (#file<n>).
//
// It scans everything that is published: a stage directory (--path), the staged
// commit of a git worktree (--staged: every added or changed path and its added
// lines, regenerated registry and index files included) and text files such as
// the PR title, body and commit message (--text, repeatable, reported as text#n).
//
// Usage:
//   node scripts/olko-sanitize.mjs --project <dir> (--path <stage-dir> | --staged <worktree> | --text <file>)...
//        [--terms-file <json>] [--allow-no-config] [--json]
// Exit codes: 0 clean, 2 blocked by a leak, 1 the script failed.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BLOCKED = 2;
const MIN_TERM_LENGTH = 4;
/** Generic path, host and tooling words that name no project (compared after folding). */
const GENERIC = new Set([
  "src", "app", "apps", "main", "master", "test", "tests", "docs", "project", "projects", "repo", "repos", "code",
  "packages", "service", "services", "github", "gitlab", "bitbucket", "users", "home", "temp", "local", "git", "scm",
  "www", "com", "org", "net", "io", "ssh", "http", "https", "dev", "azure", "visualstudio", "example", "invalid",
  "localhost", "v3",
]);
const GENERIC_HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org", "dev.azure.com", "ssh.dev.azure.com", "vs-ssh.visualstudio.com", "codeberg.org"]);
const ZERO_WIDTH = /[­᠎​-‏⁠-⁤﻿]/g;
const SEPARATORS = /[-_.\s]+/g;
const REQUIRED_SOURCES = ["remote", "config"];
const SOURCES = ["folder", "repository", "remote", "manifest", "config"];
const EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g;
const PLACEHOLDER_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|example|invalid|test|localhost)$/i;
/** Deterministic secret patterns: [label, pattern]. A match blocks; the value is never printed. */
const SECRET_PATTERNS = [
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ["github-pat", /\bgithub_pat_[A-Za-z0-9_]{22,}/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["private-key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ["connection-string", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:(?![<{$])[^\s@/]+@[^\s/]+/i],
  ["connection-string", /\b(?:password|pwd|accountkey|sharedaccesskey)\s*=\s*(?![<{$])[^;\s"'<>]{3,}/i],
  ["internal-host", /(?<![\w.-])(?!(?:host|gateway|kubernetes)\.docker\.internal(?![\w.-]))[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.(?:internal|intranet|corp|lan|local|localdomain)(?![\w.-])/i],
];

/** An expected failure. The message is a fixed code; `detail` holds only fixed words, never input. */
export class GateError extends Error {
  constructor(code, detail = "") {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

/** The form both terms and text are compared in. */
export function fold(text) {
  return text.normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase().replace(SEPARATORS, "");
}

/** Words of a name, split on separators and camelCase boundaries: "BillingPortal.Api" -> Billing, Portal, Api. */
export function nameParts(name) {
  return name
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function createCollector() {
  return { terms: new Set(), found: new Map(SOURCES.map((source) => [source, 0])), dropped: new Map() };
}

/** Derived terms skip generic words; configured terms are taken as given. */
function addTerm(collector, source, value, derived = true) {
  if (typeof value !== "string") {
    return;
  }
  const term = fold(value);
  if (term.length === 0 || (derived && GENERIC.has(term))) {
    return;
  }
  if (term.length < MIN_TERM_LENGTH) {
    collector.dropped.set(source, (collector.dropped.get(source) ?? 0) + 1);
    return;
  }
  collector.terms.add(term);
  collector.found.set(source, collector.found.get(source) + 1);
}

function addName(collector, source, value) {
  if (typeof value !== "string") {
    return;
  }
  addTerm(collector, source, value);
  for (const part of nameParts(value)) {
    addTerm(collector, source, part);
  }
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function addHost(collector, host) {
  const lower = host.toLowerCase();
  if (!lower || GENERIC_HOSTS.has(lower)) {
    return;
  }
  addTerm(collector, "remote", lower);
  for (const label of lower.split(".")) {
    addTerm(collector, "remote", label);
  }
}

/** "https://host/a/b/_git/c", "user@host:a/b.git" and local paths: the host and every path segment. */
function addRemoteUrl(collector, url) {
  const schemeForm = url.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]*)(?::\d+)?(\/.*)?$/i);
  const scpForm = url.match(/^(?:[^@/\\]+@)?([^/\\:]{2,}):(.*)$/);
  let remotePath = url;
  if (schemeForm) {
    addHost(collector, schemeForm[1]);
    remotePath = schemeForm[2] ?? "";
  } else if (scpForm) {
    addHost(collector, scpForm[1]);
    remotePath = scpForm[2];
  }
  for (const segment of remotePath.split(/[/\\]+/)) {
    addName(collector, "remote", segment.replace(/\.git$/i, ""));
  }
}

function remoteTerms(project, collector) {
  const remotes = runGit(project, ["remote", "-v"]);
  if (remotes === null) {
    return;
  }
  for (const line of remotes.split("\n")) {
    const url = line.split(/\s+/)[1];
    if (url) {
      addRemoteUrl(collector, url);
    }
  }
}

/** The worktree folder name and the repository name, which differ in a linked worktree. */
function repositoryTerms(project, collector) {
  const topLevel = runGit(project, ["rev-parse", "--show-toplevel"]);
  if (topLevel) {
    addName(collector, "repository", path.basename(topLevel));
  }
  const commonDir = runGit(project, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (commonDir) {
    const resolved = path.resolve(project, commonDir);
    const name = path.basename(resolved) === ".git" ? path.basename(path.dirname(resolved)) : path.basename(resolved).replace(/\.git$/i, "");
    addName(collector, "repository", name);
  }
}

/** The `name` of a package.json; null when the file is unreadable, which names nothing. */
function packageName(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).name;
  } catch {
    return null;
  }
}

function manifestTerms(project, collector) {
  const packageJson = path.join(project, "package.json");
  if (fs.existsSync(packageJson)) {
    addName(collector, "manifest", packageName(packageJson)?.replace(/^@/, ""));
  }
  const pyproject = path.join(project, "pyproject.toml");
  if (fs.existsSync(pyproject)) {
    const name = fs.readFileSync(pyproject, "utf8").match(/^name\s*=\s*["']([^"']+)["']/m);
    if (name) {
      addName(collector, "manifest", name[1]);
    }
  }
  for (const entry of fs.readdirSync(project, { withFileTypes: true })) {
    if (entry.isFile() && /\.(sln|csproj)$/i.test(entry.name)) {
      addName(collector, "manifest", entry.name.replace(/\.(sln|csproj)$/i, ""));
    }
  }
}

function readConfig(termsFile) {
  const file = termsFile ?? path.join(process.env.OLKO_SYNC_HOME ?? path.join(os.homedir(), ".olko-sync"), "targets.json");
  if (!fs.existsSync(file)) {
    if (termsFile) {
      throw new GateError("E_TERMS_FILE_MISSING");
    }
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new GateError("E_TERMS_FILE_INVALID");
  }
}

function configuredTerms(termsFile, collector) {
  const config = readConfig(termsFile);
  for (const key of ["leakTerms", "forbiddenTerms"]) {
    if (config[key] !== undefined && !Array.isArray(config[key])) {
      throw new GateError("E_TERMS_FILE_INVALID");
    }
    for (const term of config[key] ?? []) {
      addTerm(collector, "config", term, false);
    }
  }
  for (const target of Object.values(config.targets ?? {})) {
    if (typeof target?.path === "string") {
      addTerm(collector, "config", path.basename(target.path));
    }
  }
  for (const term of (process.env.FACTORY_LEAK_TERMS ?? "").split(",")) {
    addTerm(collector, "config", term, false);
  }
}

/**
 * Every term to block, longest first, plus warnings that name sources and counts, never values.
 * Throws E_NO_TERMS when a required source is empty and `allowNoConfig` is not set.
 */
export function collectTerms(project, termsFile, { allowNoConfig = false } = {}) {
  const collector = createCollector();
  addName(collector, "folder", path.basename(path.resolve(project)));
  repositoryTerms(project, collector);
  remoteTerms(project, collector);
  manifestTerms(project, collector);
  configuredTerms(termsFile, collector);
  const empty = SOURCES.filter((source) => collector.found.get(source) === 0);
  const missing = REQUIRED_SOURCES.filter((source) => empty.includes(source));
  if (missing.length > 0 && !allowNoConfig) {
    throw new GateError("E_NO_TERMS", `empty term sources: ${missing.join(", ")}; pass --allow-no-config to scan without them`);
  }
  const warnings = [];
  if (empty.length > 0) {
    warnings.push(`empty term sources: ${empty.join(", ")}`);
  }
  for (const [source, count] of collector.dropped) {
    if (count > 0) {
      warnings.push(`${count} derived term(s) from ${source} shorter than ${MIN_TERM_LENGTH} characters were not checked`);
    }
  }
  const terms = [...collector.terms].sort((left, right) => right.length - left.length || left.localeCompare(right));
  return { terms, warnings };
}

/** Text of a file: UTF-16 by byte order mark, else UTF-8; null for a binary file. */
export function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return Buffer.from(buffer.subarray(2)).swap16().toString("utf16le");
  }
  if (buffer.includes(0)) {
    return null;
  }
  return buffer.toString("utf8").replace(/^﻿/, "");
}

function secretLabels(text) {
  const labels = new Set();
  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      labels.add(label);
    }
  }
  for (const match of text.matchAll(EMAIL)) {
    const localPart = match[0].slice(0, match[0].indexOf("@"));
    if (localPart !== "git" && !PLACEHOLDER_EMAIL_DOMAIN.test(match[1])) {
      labels.add("email");
    }
  }
  return labels;
}

/**
 * Hits of one line: `#n` for term n, `#secret:<label>` for a secret pattern. Terms are
 * sorted longest first; a term inside one that already hit the line is not reported again.
 */
export function lineHits(terms, text) {
  const folded = fold(text);
  const hits = [];
  const matched = [];
  terms.forEach((term, index) => {
    if (folded.includes(term) && !matched.some((longer) => longer.includes(term))) {
      matched.push(term);
      hits.push(`#${index + 1}`);
    }
  });
  for (const label of secretLabels(text)) {
    hits.push(`#secret:${label}`);
  }
  return hits;
}

/** Every entry under the stage: regular files, and anything else (symlink, junction, device) as non-regular. */
function stagedEntries(stage) {
  if (!fs.existsSync(stage) || !fs.statSync(stage).isDirectory()) {
    throw new GateError("E_STAGE_MISSING");
  }
  const entries = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(stage, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        walk(absolute);
      } else {
        entries.push({ name: relative, absolute, regular: entry.isFile() });
      }
    }
  };
  walk(stage);
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

function textLines(text) {
  return text.replace(/\r\n/g, "\n").split("\n").map((line, index) => ({ line: index + 1, text: line }));
}

/** Hits of one item's content: its `lines`, or the decoded `buffer`; `nonRegular` and binary items block as such. */
function contentHits(terms, item) {
  if (item.nonRegular) {
    return [{ line: 0, term: "#non-regular" }];
  }
  let lines = item.lines;
  if (!lines) {
    const text = decodeText(item.buffer);
    if (text === null) {
      return [{ line: 0, term: "#binary" }];
    }
    lines = textLines(text);
  }
  const hits = [];
  for (const { line, text } of lines) {
    for (const term of lineHits(terms, text)) {
      hits.push({ line, term });
    }
  }
  return hits;
}

/**
 * Hits of named items ({ name, buffer | lines | nonRegular }): the name is line 0.
 * An item whose name holds a hit is reported as #file<n>, never by its name.
 */
export function report(items, terms) {
  const hits = [];
  items.forEach((item, index) => {
    const nameHits = lineHits(terms, item.name).map((term) => ({ line: 0, term }));
    const file = nameHits.length > 0 ? `#file${index + 1}` : item.name;
    for (const hit of [...nameHits, ...contentHits(terms, item)]) {
      hits.push({ file, line: hit.line, term: hit.term });
    }
  });
  return { clean: hits.length === 0, hits };
}

function stageItems(stage) {
  return stagedEntries(stage).map((entry) => (entry.regular ? { name: entry.name, buffer: fs.readFileSync(entry.absolute) } : { name: entry.name, nonRegular: true }));
}

function gitOutput(cwd, args) {
  const result = spawnSync("git", ["--literal-pathspecs", "-c", "core.quotepath=false", ...args], { cwd, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new GateError("E_GIT");
  }
  return result.stdout;
}

/** Added lines of one staged file, numbered as in the staged version. */
function addedLines(worktree, file) {
  const diff = gitOutput(worktree, ["diff", "--cached", "--no-color", "--no-ext-diff", "--no-renames", "--unified=0", "--text", "--", file]).toString("utf8");
  const lines = [];
  let next = 0;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    const header = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      next = Number(header[1]);
      inHunk = true;
    } else if (inHunk && line.startsWith("+")) {
      lines.push({ line: next, text: line.slice(1).replace(/\r$/, "") });
      next += 1;
    }
  }
  return lines;
}

/**
 * The staged commit of a git worktree: every added or changed path (name and added lines).
 * Symlinks and submodules are non-regular; binary blobs block; UTF-16 blobs are scanned whole.
 */
function stagedCommitItems(worktree) {
  const raw = gitOutput(worktree, ["diff", "--cached", "--raw", "-z", "--no-renames", "--no-abbrev", "--diff-filter=d"]).toString("utf8").split("\0");
  const items = [];
  for (let index = 0; index + 1 < raw.length && raw[index].startsWith(":"); index += 2) {
    const [, newMode, , newBlob] = raw[index].slice(1).split(" ");
    const file = raw[index + 1];
    const name = `staged:${file}`;
    if (!newMode.startsWith("100")) {
      items.push({ name, nonRegular: true });
      continue;
    }
    const blob = gitOutput(worktree, ["cat-file", "blob", newBlob]);
    const text = decodeText(blob);
    const utf16 = (blob[0] === 0xff && blob[1] === 0xfe) || (blob[0] === 0xfe && blob[1] === 0xff);
    if (text === null) {
      items.push({ name, buffer: blob });
    } else if (utf16) {
      items.push({ name, lines: textLines(text) });
    } else {
      items.push({ name, lines: addedLines(worktree, file) });
    }
  }
  return items;
}

/** Text that is published but is no file, such as a PR title, body or commit message: reported as text#<n>. */
function textItems(files) {
  return files.map((file, index) => {
    try {
      return { name: `text#${index + 1}`, buffer: fs.readFileSync(file) };
    } catch {
      throw new GateError("E_TEXT_UNREADABLE");
    }
  });
}

/**
 * Scans everything that is published: a stage directory (`stage`), the staged commit of a
 * git worktree (`staged`) and text files (`texts`), against the terms of `project`.
 */
export function scan({ stage, staged, texts = [], project, termsFile, allowNoConfig = false }) {
  const { terms, warnings } = collectTerms(project, termsFile, { allowNoConfig });
  const items = [
    ...(stage ? stageItems(stage) : []),
    ...(staged ? stagedCommitItems(staged) : []),
    ...textItems(texts),
  ];
  return { ...report(items, terms), warnings };
}

const USAGE = "--project <dir> (--path <stage-dir> | --staged <git worktree> | --text <file>)... [--terms-file <json>] [--allow-no-config] [--json]";

function parseArgs(argv) {
  const options = { texts: [] };
  const flags = { "--path": "stage", "--project": "project", "--terms-file": "termsFile", "--staged": "staged" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--allow-no-config") {
      options.allowNoConfig = true;
    } else if (argument === "--text" && index + 1 < argv.length) {
      options.texts.push(argv[++index]);
    } else if (flags[argument] && index + 1 < argv.length) {
      options[flags[argument]] = argv[++index];
    } else {
      throw new GateError("E_USAGE", USAGE);
    }
  }
  if (!options.project || (!options.stage && !options.staged && options.texts.length === 0)) {
    throw new GateError("E_USAGE", USAGE);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = scan({
    stage: options.stage && path.resolve(options.stage),
    staged: options.staged && path.resolve(options.staged),
    texts: options.texts.map((file) => path.resolve(file)),
    project: path.resolve(options.project),
    termsFile: options.termsFile,
    allowNoConfig: options.allowNoConfig,
  });
  for (const warning of result.warnings) {
    console.error(`warning: ${warning}`);
  }
  const { clean, hits } = result;
  console.log(options.json ? JSON.stringify({ clean, hits }) : clean ? "clean" : `blocked: ${hits.length} hit(s)`);
  if (!clean) {
    process.exitCode = BLOCKED;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const known = error instanceof GateError;
    const detail = known && error.detail ? ` (${error.detail})` : "";
    console.error(`sanitize failed: ${known ? error.code : "E_INTERNAL"}${detail}`);
    process.exitCode = 1;
  }
}
