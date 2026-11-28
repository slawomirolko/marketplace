#!/usr/bin/env node
/**
 * Checks a project's decision store (ADRs and rule files) and builds the digest of binding rules for a set of paths.
 *
 * Usage:
 *   node scripts/check-store.mjs <project> [--adr <dir>] [--rules <dir>] [--json]
 *   node scripts/check-store.mjs <project> [--adr <dir>] [--rules <dir>] --digest <path>...
 *
 * Exit codes: 0 valid (or digest written), 1 store errors, 2 usage error.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATUSES = ["Proposed", "Accepted", "Deprecated", "Superseded"];
export const ENFORCED = ["none", "archtest", "lint", "ci"];
const REQUIRED = ["status", "topic", "scope", "decision", "enforcedBy"];
const TOPIC = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ADR_FILE = /^(\d{4})-[^/\\]+\.md$/;
const RULE_LINE = /\b(MUST NOT|MUST|SHOULD NOT|SHOULD)\b/;
const BINDING_LINE = /\b(MUST NOT|MUST)\b/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const BYTE_ORDER_MARK = /^﻿/;
/** The line that opens and closes front matter, with its newline. */
const FENCE = "---\n";
/** The `enforcedBy` value of an ADR that no tool enforces, so its consequences go into the digest. */
const NOT_ENFORCED = "none";
/** The digest topic of a line from a rule file. */
const RULE_TOPIC = "rule";
const USAGE = "Usage: node check-store.mjs <project> [--adr <dir>] [--rules <dir>] [--json] [--digest <path>...]";
const USAGE_EXIT = 2;
export const FIX_HINT = "To fix: run the factory workflow olko-adr-store-reconcile with this project (it asks one question per batch or group and writes only what you approve), or fix one entry with the skill olko-init-project-docs.";

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function inlineList(value) {
  const inner = value.trim().slice(1, -1).trim();
  return inner ? inner.split(",").map((item) => unquote(item)).filter(Boolean) : [];
}

/** The value of a `key: value` line: an inline list, a block scalar marker, or a plain string. */
function scalarValue(value) {
  if (value.startsWith("[") && value.endsWith("]")) {
    return inlineList(value);
  }
  if (value === "|" || value === ">") {
    return { block: value };
  }
  return unquote(value);
}

/** A small YAML subset: `key: value`, `key: [a, b]`, and `key:` followed by `- item` lines. */
export function parseFrontMatter(text) {
  const normalized = text.replace(BYTE_ORDER_MARK, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith(FENCE)) {
    return { front: null, body: normalized };
  }
  const end = normalized.indexOf("\n---", FENCE.length);
  if (end === -1) {
    return { front: null, body: normalized };
  }
  const front = {};
  let listKey = null;
  for (const line of normalized.slice(FENCE.length, end).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      front[listKey].push(unquote(item[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!pair) {
      continue;
    }
    const [, key, raw] = pair;
    const value = raw.trim();
    if (value === "") {
      front[key] = [];
      listKey = key;
    } else {
      listKey = null;
      front[key] = scalarValue(value);
    }
  }
  const after = normalized.indexOf("\n", end + FENCE.length);
  return { front, body: after === -1 ? "" : normalized.slice(after + 1) };
}

function asList(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function adrId(ref) {
  const match = String(ref).match(/(\d{1,4})/);
  return match ? `ADR-${match[1].padStart(4, "0")}` : String(ref);
}

function readConfigDir(project, key, fallback) {
  const file = path.join(project, ".agents", "skill-config.md");
  if (!fs.existsSync(file)) {
    return fallback;
  }
  const match = fs.readFileSync(file, "utf8").match(new RegExp(`\`?${key}\`?\\W+\`?([\\w./-]+)`));
  return match ? match[1] : fallback;
}

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function tableRows(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim().startsWith("|"));
  if (lines.length < 2) {
    return { header: [], rows: [] };
  }
  const header = tableCells(lines[0]).map((cell) => cell.toLowerCase());
  const rows = lines.slice(1).filter((line) => !/^\|\s*-/.test(line.trim())).map(tableCells);
  return { header, rows };
}

function globsOf(cell) {
  return (cell.match(/`([^`]+)`/g) ?? []).map((glob) => glob.slice(1, -1));
}

function normalizeStatus(value) {
  const text = String(value ?? "").trim();
  if (/^superseded/i.test(text)) {
    return "Superseded";
  }
  return STATUSES.find((status) => status.toLowerCase() === text.toLowerCase()) ?? text;
}

function consequenceLines(body) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => /^##\s+Consequences\b/i.test(line));
  if (start === -1) {
    return [];
  }
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) {
      break;
    }
    const bullet = line.match(BULLET);
    if (bullet && BINDING_LINE.test(bullet[1])) {
      out.push(bullet[1].trim());
    }
  }
  return out;
}

function loadAdrs(adrDir) {
  const adrs = [];
  for (const name of fs.readdirSync(adrDir).sort()) {
    const match = name.match(ADR_FILE);
    if (!match) {
      continue;
    }
    const file = path.join(adrDir, name);
    const { front, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
    adrs.push({ id: `ADR-${match[1]}`, file, front, legacy: front === null, consequences: consequenceLines(body) });
  }
  return adrs;
}

function loadRules(rulesDir) {
  const rules = [];
  for (const name of fs.readdirSync(rulesDir).sort()) {
    if (!name.endsWith(".md") || name === "README.md") {
      continue;
    }
    const file = path.join(rulesDir, name);
    const { front, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
    const lines = body.split("\n").map((line) => line.match(BULLET)?.[1]?.trim()).filter((line) => line && RULE_LINE.test(line));
    rules.push({ name, file, front, lines });
  }
  return rules;
}

export function loadStore(project, options = {}) {
  const adrDir = path.resolve(project, options.adr ?? readConfigDir(project, "adrDirectory", "docs/adr"));
  const rulesDir = path.resolve(project, options.rules ?? readConfigDir(project, "rulesDirectory", "docs/rules"));
  const store = { project: path.resolve(project), adrDir, rulesDir, adrs: [], rules: [], log: null, exists: fs.existsSync(adrDir) || fs.existsSync(rulesDir) };
  if (fs.existsSync(adrDir)) {
    store.adrs = loadAdrs(adrDir);
    const readme = path.join(adrDir, "README.md");
    if (fs.existsSync(readme)) {
      store.log = tableRows(fs.readFileSync(readme, "utf8"));
    }
  }
  if (fs.existsSync(rulesDir)) {
    store.rules = loadRules(rulesDir);
  }
  return store;
}

const REGEXP_SPECIAL = /[.+^$()|[\]\\]/g;

/** Finds the `}` that closes the brace opened at `open`, or -1 when it is unbalanced. */
function closingBrace(glob, open) {
  let depth = 0;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === "{") {
      depth++;
    } else if (glob[i] === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Splits brace content on commas that are not inside a nested brace. */
function braceAlternatives(content) {
  const alternatives = [];
  let depth = 0;
  let current = "";
  for (const character of content) {
    if (character === "," && depth === 0) {
      alternatives.push(current);
      current = "";
      continue;
    }
    if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
    }
    current += character;
  }
  alternatives.push(current);
  return alternatives;
}

function globSource(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const character = glob[i];
    if (character === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else if (character === "{") {
      const close = closingBrace(glob, i);
      if (close === -1) {
        source += "\\{";
      } else {
        source += `(?:${braceAlternatives(glob.slice(i + 1, close)).map(globSource).join("|")})`;
        i = close;
      }
    } else {
      source += character.replace(REGEXP_SPECIAL, "\\$&");
    }
  }
  return source;
}

export function globToRegExp(glob) {
  return new RegExp(`^${globSource(glob)}$`);
}

export function matches(globs, file) {
  const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");
  return globs.some((glob) => globToRegExp(glob).test(normalized));
}

const WILDCARD = /[*?{[]/;

function literalPrefix(glob) {
  const index = glob.search(WILDCARD);
  return index === -1 ? glob : glob.slice(0, index);
}

/**
 * Whether paths matched by `glob` (literal prefix `prefix`) can start with the literal prefix `other`.
 * Prefixes are compared on `/` segment boundaries: a single-segment wildcard cannot reach into a deeper directory.
 */
function prefixReaches(glob, prefix, other) {
  if (!other.startsWith(prefix)) {
    return false;
  }
  const rest = other.slice(prefix.length);
  if (prefix === "" || prefix.endsWith("/") || rest === "") {
    return true;
  }
  if (glob.length === prefix.length) {
    return rest.startsWith("/");
  }
  if (glob.startsWith("**", prefix.length) || glob[prefix.length] === "{" || glob[prefix.length] === "[") {
    return true;
  }
  return !rest.includes("/");
}

/**
 * Approximate: two globs overlap when one literal prefix extends the other on a segment boundary.
 * Only the literal prefixes are compared, so it errs towards false positives (`src/*.cs` and
 * `src/*.ts` are reported as overlapping) and does not miss a real overlap.
 */
export function globsOverlap(left, right) {
  return left.some((leftGlob) => right.some((rightGlob) => {
    const leftPrefix = literalPrefix(leftGlob);
    const rightPrefix = literalPrefix(rightGlob);
    return prefixReaches(leftGlob, leftPrefix, rightPrefix) || prefixReaches(rightGlob, rightPrefix, leftPrefix);
  }));
}

/**
 * Approximate: `broad` covers `narrow` when every narrow glob extends the literal prefix of a broad glob that has a wildcard.
 * False positives: `src/*.cs` is taken to cover `src/a.ts`, since only prefixes are compared. False negatives: a broad
 * glob without a wildcard covers nothing, not even the same literal path.
 */
export function globsCover(broad, narrow) {
  return narrow.every((narrowGlob) => broad.some((broadGlob) => WILDCARD.test(broadGlob) && prefixReaches(broadGlob, literalPrefix(broadGlob), literalPrefix(narrowGlob))));
}

function scopeOf(adr) {
  return asList(adr.front?.scope);
}

function relativeName(store, file) {
  return path.relative(store.project, file).replace(/\\/g, "/");
}

function isAccepted(adr) {
  return !adr.legacy && normalizeStatus(adr.front.status) === "Accepted";
}

/** The ADR log rows by ADR id, and the error when ADRs exist but the log does not. */
function indexLog(store) {
  const logById = new Map();
  const errors = [];
  if (!store.log) {
    if (store.adrs.length) {
      errors.push(`${path.relative(store.project, store.adrDir) || "."}/README.md: the ADR log is missing`);
    }
    return { logById, errors };
  }
  const column = (name) => store.log.header.indexOf(name);
  for (const row of store.log.rows) {
    const id = adrId(row[column("adr")] ?? "");
    logById.set(id, { status: normalizeStatus(row[column("status")]), raw: row[column("status")], topic: column("topic") === -1 ? undefined : row[column("topic")], scope: globsOf(row[column("scope")] ?? "") });
  }
  return { logById, errors };
}

/** Errors in the front matter values of one ADR. */
function frontMatterErrors(name, front) {
  const errors = [];
  const status = normalizeStatus(front.status);
  if (front.status !== undefined && !STATUSES.includes(status)) {
    errors.push(`${name}: status must be one of ${STATUSES.join(", ")}`);
  }
  if (front.topic !== undefined && !TOPIC.test(String(front.topic))) {
    errors.push(`${name}: topic must be dot-separated lowercase, for example persistence.orm`);
  }
  if (front.decision !== undefined && (typeof front.decision !== "string" || !front.decision.trim())) {
    errors.push(`${name}: decision must be one line of text`);
  }
  if (front.enforcedBy !== undefined && !ENFORCED.includes(String(front.enforcedBy))) {
    errors.push(`${name}: enforcedBy must be one of ${ENFORCED.join(", ")}`);
  }
  return errors;
}

/** Errors where an ADR and its log row disagree. */
function logErrors(name, adr, log) {
  const errors = [];
  const status = normalizeStatus(adr.front.status);
  if (log.status !== status) {
    errors.push(`${name}: status ${status} differs from the log (${log.raw})`);
  }
  if (log.topic !== undefined && log.topic !== String(adr.front.topic ?? "")) {
    errors.push(`${name}: topic ${adr.front.topic} differs from the log (${log.topic})`);
  }
  const scope = scopeOf(adr);
  if (scope.length && log.scope.length && [...scope].sort().join(",") !== [...log.scope].sort().join(",")) {
    errors.push(`${name}: scope differs from the log`);
  }
  return errors;
}

/** Errors in the `supersedes` links of one ADR: the target exists and is Superseded. */
function supersedesErrors(name, adr, byId, logById) {
  const errors = [];
  for (const ref of asList(adr.front.supersedes).map(adrId)) {
    const target = byId.get(ref);
    if (!target) {
      errors.push(`${name}: supersedes ${ref}, which does not exist`);
    } else if (normalizeStatus(target.front?.status ?? logById.get(ref)?.status) !== "Superseded") {
      errors.push(`${name}: supersedes ${ref}, but ${ref} is not Superseded`);
    }
  }
  return errors;
}

/** Errors in the `overrides` links of one ADR: the target exists, is Accepted, has the same topic and a broader scope. */
function overridesErrors(name, adr, byId) {
  const errors = [];
  for (const ref of asList(adr.front.overrides).map(adrId)) {
    const target = byId.get(ref);
    if (!target) {
      errors.push(`${name}: overrides ${ref}, which does not exist`);
      continue;
    }
    if (normalizeStatus(target.front?.status) !== "Accepted") {
      errors.push(`${name}: overrides ${ref}, which is not Accepted`);
    }
    if (String(target.front?.topic) !== String(adr.front.topic)) {
      errors.push(`${name}: overrides ${ref}, which has another topic`);
    }
    if (!globsCover(scopeOf(target), scopeOf(adr))) {
      errors.push(`${name}: overrides ${ref}, whose scope is not broader`);
    }
  }
  return errors;
}

/** The errors, warnings and missing front matter keys of one ADR. */
function checkAdr(store, adr, byId, logById) {
  const name = relativeName(store, adr.file);
  const log = logById.get(adr.id);
  const errors = [];
  if (!log && store.log) {
    errors.push(`${name}: no row in the ADR log`);
  }
  if (adr.legacy) {
    return { errors, warnings: [`${name}: no front matter (legacy ADR, read in full)`], missing: [{ id: adr.id, file: name, keys: REQUIRED }] };
  }
  const missing = [];
  const absent = REQUIRED.filter((key) => adr.front[key] === undefined || (Array.isArray(adr.front[key]) && adr.front[key].length === 0));
  if (absent.length) {
    missing.push({ id: adr.id, file: name, keys: absent });
    errors.push(`${name}: missing front matter ${absent.join(", ")}`);
  }
  errors.push(...frontMatterErrors(name, adr.front));
  if (log) {
    errors.push(...logErrors(name, adr, log));
  }
  errors.push(...supersedesErrors(name, adr, byId, logById));
  errors.push(...overridesErrors(name, adr, byId));
  return { errors, warnings: [], missing };
}

/** Pairs of Accepted ADRs with the same topic and overlapping scopes and no `overrides` link between them. */
function findCollisions(adrs) {
  const accepted = adrs.filter((adr) => isAccepted(adr) && adr.front.topic);
  const links = new Set(accepted.flatMap((adr) => asList(adr.front.overrides).map((ref) => `${adr.id}>${adrId(ref)}`)));
  const collisions = [];
  const errors = [];
  for (let i = 0; i < accepted.length; i++) {
    for (let j = i + 1; j < accepted.length; j++) {
      const first = accepted[i];
      const second = accepted[j];
      if (String(first.front.topic) !== String(second.front.topic)) {
        continue;
      }
      if (!globsOverlap(scopeOf(first), scopeOf(second))) {
        continue;
      }
      if (links.has(`${first.id}>${second.id}`) || links.has(`${second.id}>${first.id}`)) {
        continue;
      }
      collisions.push([first.id, second.id]);
      errors.push(`${first.id} and ${second.id}: both Accepted with topic ${first.front.topic} and overlapping scopes, and no overrides link`);
    }
  }
  return { collisions, errors };
}

/** Warnings for Superseded ADRs that no ADR lists under `supersedes`. */
function orphanSupersededWarnings(adrs) {
  const warnings = [];
  for (const adr of adrs) {
    if (adr.legacy || normalizeStatus(adr.front.status) !== "Superseded") {
      continue;
    }
    if (!adrs.some((other) => !other.legacy && asList(other.front.supersedes).map(adrId).includes(adr.id))) {
      warnings.push(`${adr.id}: Superseded, but no ADR lists it under supersedes`);
    }
  }
  return warnings;
}

/** Errors for rule files without front matter `scope` or `summary`. */
function checkRules(store) {
  const errors = [];
  for (const rule of store.rules) {
    const name = relativeName(store, rule.file);
    if (!rule.front || !asList(rule.front.scope).length) {
      errors.push(`${name}: rule file needs front matter scope`);
    }
    if (!rule.front || !rule.front.summary) {
      errors.push(`${name}: rule file needs front matter summary`);
    }
  }
  return errors;
}

export function checkStore(store) {
  const byId = new Map(store.adrs.map((adr) => [adr.id, adr]));
  const { logById, errors } = indexLog(store);
  const warnings = [];
  const missing = [];
  for (const adr of store.adrs) {
    const result = checkAdr(store, adr, byId, logById);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    missing.push(...result.missing);
  }
  const { collisions, errors: collisionErrors } = findCollisions(store.adrs);
  errors.push(...collisionErrors);
  warnings.push(...orphanSupersededWarnings(store.adrs));
  errors.push(...checkRules(store));
  return { errors, warnings, missing, groups: groupsOf(collisions, byId) };
}

function groupsOf(pairs, byId) {
  const parent = new Map();
  const find = (id) => (parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id)));
  for (const [first, second] of pairs) {
    if (!parent.has(first)) {
      parent.set(first, first);
    }
    if (!parent.has(second)) {
      parent.set(second, second);
    }
    parent.set(find(first), find(second));
  }
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root).push(id);
  }
  return [...groups.values()].map((ids) => ({ topic: String(byId.get(ids[0])?.front?.topic ?? ""), adrs: ids.sort() })).sort((left, right) => right.adrs.length - left.adrs.length);
}

/**
 * The binding Accepted ADRs for the given files, by id, and the topics where more than one ADR is
 * left after `overrides` (blocked, with the files that hit them).
 */
function bindingFor(files, accepted) {
  const binding = new Map();
  const blocked = new Map();
  for (const file of files) {
    const byTopic = new Map();
    for (const adr of accepted.filter((candidate) => matches(scopeOf(candidate), file))) {
      const topic = String(adr.front.topic ?? adr.id);
      if (!byTopic.has(topic)) {
        byTopic.set(topic, []);
      }
      byTopic.get(topic).push(adr);
    }
    for (const [topic, group] of byTopic) {
      const overridden = new Set(group.flatMap((adr) => asList(adr.front.overrides).map(adrId)));
      const left = group.filter((adr) => !overridden.has(adr.id));
      if (left.length === 1) {
        binding.set(left[0].id, left[0]);
        continue;
      }
      const ids = left.map((adr) => adr.id).sort();
      const key = `${topic}:${ids.join(",")}`;
      if (!blocked.has(key)) {
        blocked.set(key, { topic, adrs: ids, paths: [] });
      }
      blocked.get(key).paths.push(file);
    }
  }
  return { binding, blocked: [...blocked.values()] };
}

/**
 * The digest lines of the binding ADRs (the decision, then the consequences of an ADR no tool enforces)
 * and of the rule files whose scope matches a file, plus the ADRs a tool enforces.
 */
function digestLines(binding, rules, files) {
  const digest = [];
  const enforced = [];
  for (const adr of [...binding.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const topic = String(adr.front.topic);
    digest.push({ source: adr.id, topic, line: String(adr.front.decision) });
    if (String(adr.front.enforcedBy ?? NOT_ENFORCED) !== NOT_ENFORCED) {
      enforced.push({ source: adr.id, by: String(adr.front.enforcedBy) });
      continue;
    }
    for (const line of adr.consequences) {
      digest.push({ source: adr.id, topic, line });
    }
  }
  for (const rule of rules) {
    if (!rule.front || !files.some((file) => matches(asList(rule.front.scope), file))) {
      continue;
    }
    for (const line of rule.lines) {
      digest.push({ source: `rules/${rule.name}`, topic: RULE_TOPIC, line });
    }
  }
  return { digest, enforced };
}

/** The binding ADR lines and rule lines for the given paths. */
export function buildDigest(store, paths) {
  if (!store.exists) {
    return { noStore: true, digest: [], blocked: [], legacy: [], enforced: [] };
  }
  const files = paths.map((file) => file.replace(/\\/g, "/"));
  const { binding, blocked } = bindingFor(files, store.adrs.filter(isAccepted));
  const { digest, enforced } = digestLines(binding, store.rules, files);
  const legacy = store.adrs.filter((adr) => adr.legacy).map((adr) => ({ id: adr.id, file: relativeName(store, adr.file) }));
  return { noStore: false, digest, blocked, legacy, enforced };
}

function usage(message) {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exit(USAGE_EXIT);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = { options: {}, project: undefined, json: false, digestPaths: null };
  while (args.length) {
    const argument = args.shift();
    if (argument === "--adr" || argument === "--rules") {
      const value = args.shift();
      if (!value) {
        usage(`${argument} needs a directory`);
      }
      parsed.options[argument.slice(2)] = value;
    } else if (argument === "--json") {
      parsed.json = true;
    } else if (argument === "--digest") {
      parsed.digestPaths = args.splice(0);
    } else if (!parsed.project) {
      parsed.project = argument;
    } else {
      usage(`unexpected argument ${argument}`);
    }
  }
  return parsed;
}

function printCheck(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify({ noStore: false, ...result }, null, 2)}\n`);
    return;
  }
  for (const error of result.errors) {
    process.stdout.write(`error: ${error}\n`);
  }
  for (const warning of result.warnings) {
    process.stdout.write(`warning: ${warning}\n`);
  }
  process.stdout.write(result.errors.length ? `${result.errors.length} error(s)\n${FIX_HINT}\n` : "store is valid\n");
}

function main(argv) {
  const { options, project, json, digestPaths } = parseArgs(argv);
  if (!project) {
    usage("the project directory is missing");
  }
  if (!fs.existsSync(project)) {
    usage(`${project} does not exist`);
  }
  const store = loadStore(project, options);
  if (digestPaths) {
    process.stdout.write(`${JSON.stringify(buildDigest(store, digestPaths), null, 2)}\n`);
    return 0;
  }
  if (!store.exists) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ noStore: true, errors: [], warnings: [], missing: [], groups: [] }, null, 2)}\n`);
    } else {
      process.stdout.write("no-store: neither the ADR nor the rules directory exists\n");
    }
    return 0;
  }
  const result = checkStore(store);
  printCheck(result, json);
  return result.errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
