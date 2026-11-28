#!/usr/bin/env node
// Checks a project's decision store (ADRs and rule files) and builds the digest of binding rules for a set of paths.
// Usage:
//   node check-store.mjs <project> [--adr <dir>] [--rules <dir>] [--json]
//   node check-store.mjs <project> [--adr <dir>] [--rules <dir>] --digest <path>...
// Exit codes: 0 valid (or digest written), 1 store errors, 2 usage error.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATUSES = ["Proposed", "Accepted", "Deprecated", "Superseded"];
export const ENFORCED = ["none", "archtest", "lint", "ci"];
const REQUIRED = ["status", "topic", "scope", "decision", "enforcedBy"];
const TOPIC = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ADR_FILE = /^(\d{4})-[^/\\]+\.md$/;
const RULE_LINE = /\b(MUST NOT|MUST|SHOULD NOT|SHOULD)\b/;
export const FIX_HINT = "To fix: run the factory workflow olko-adr-store-reconcile with this project (it asks one question per batch or group and writes only what you approve), or fix one entry with the skill olko-init-project-docs.";

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function inlineList(value) {
  const inner = value.trim().slice(1, -1).trim();
  return inner ? inner.split(",").map((item) => unquote(item)).filter(Boolean) : [];
}

// A small YAML subset: `key: value`, `key: [a, b]`, and `key:` followed by `- item` lines.
export function parseFrontMatter(text) {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { front: null, body: normalized };
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { front: null, body: normalized };
  const front = {};
  let listKey = null;
  for (const line of normalized.slice(4, end).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      front[listKey].push(unquote(item[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!pair) continue;
    const [, key, raw] = pair;
    const value = raw.trim();
    if (value === "") {
      front[key] = [];
      listKey = key;
    } else {
      listKey = null;
      front[key] = value.startsWith("[") && value.endsWith("]") ? inlineList(value) : value === "|" || value === ">" ? { block: value } : unquote(value);
    }
  }
  const after = normalized.indexOf("\n", end + 4);
  return { front, body: after === -1 ? "" : normalized.slice(after + 1) };
}

function asList(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function adrId(ref) {
  const m = String(ref).match(/(\d{1,4})/);
  return m ? `ADR-${m[1].padStart(4, "0")}` : String(ref);
}

function readConfigDir(project, key, fallback) {
  const file = path.join(project, ".agents", "skill-config.md");
  if (!fs.existsSync(file)) return fallback;
  const m = fs.readFileSync(file, "utf8").match(new RegExp(`\`?${key}\`?\\W+\`?([\\w./-]+)`));
  return m ? m[1] : fallback;
}

function tableRows(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return { header: [], rows: [] };
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).filter((l) => !/^\|\s*-/.test(l.trim())).map(cells);
  return { header, rows };
}

function globsOf(cell) {
  return (cell.match(/`([^`]+)`/g) ?? []).map((g) => g.slice(1, -1));
}

function normalizeStatus(value) {
  const v = String(value ?? "").trim();
  if (/^superseded/i.test(v)) return "Superseded";
  return STATUSES.find((s) => s.toLowerCase() === v.toLowerCase()) ?? v;
}

function consequenceLines(body) {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => /^##\s+Consequences\b/i.test(l));
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet && /\b(MUST NOT|MUST)\b/.test(bullet[1])) out.push(bullet[1].trim());
  }
  return out;
}

export function loadStore(project, options = {}) {
  const adrDir = path.resolve(project, options.adr ?? readConfigDir(project, "adrDirectory", "docs/adr"));
  const rulesDir = path.resolve(project, options.rules ?? readConfigDir(project, "rulesDirectory", "docs/rules"));
  const store = { project: path.resolve(project), adrDir, rulesDir, adrs: [], rules: [], log: null, exists: fs.existsSync(adrDir) || fs.existsSync(rulesDir) };
  if (fs.existsSync(adrDir)) {
    for (const name of fs.readdirSync(adrDir).sort()) {
      const m = name.match(ADR_FILE);
      if (!m) continue;
      const file = path.join(adrDir, name);
      const { front, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
      store.adrs.push({ id: `ADR-${m[1]}`, file, front, legacy: front === null, consequences: consequenceLines(body) });
    }
    const readme = path.join(adrDir, "README.md");
    if (fs.existsSync(readme)) store.log = tableRows(fs.readFileSync(readme, "utf8"));
  }
  if (fs.existsSync(rulesDir)) {
    for (const name of fs.readdirSync(rulesDir).sort()) {
      if (!name.endsWith(".md") || name === "README.md") continue;
      const file = path.join(rulesDir, name);
      const { front, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
      const lines = body.split("\n").map((l) => l.match(/^\s*[-*]\s+(.*)$/)?.[1]?.trim()).filter((l) => l && RULE_LINE.test(l));
      store.rules.push({ name, file, front, lines });
    }
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
  const p = file.replace(/\\/g, "/").replace(/^\.\//, "");
  return globs.some((g) => globToRegExp(g).test(p));
}

function literalPrefix(glob) {
  const i = glob.search(/[*?{[]/);
  return i === -1 ? glob : glob.slice(0, i);
}

const WILDCARD = /[*?{[]/;

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

/** Approximate: two globs overlap when one literal prefix extends the other on a segment boundary. */
export function globsOverlap(a, b) {
  return a.some((x) => b.some((y) => {
    const px = literalPrefix(x);
    const py = literalPrefix(y);
    return prefixReaches(x, px, py) || prefixReaches(y, py, px);
  }));
}

/** Approximate: `broad` covers `narrow` when every narrow glob extends the literal prefix of a broad glob that has a wildcard. */
export function globsCover(broad, narrow) {
  return narrow.every((n) => broad.some((b) => WILDCARD.test(b) && prefixReaches(b, literalPrefix(b), literalPrefix(n))));
}

function scopeOf(adr) {
  return asList(adr.front?.scope);
}

export function checkStore(store) {
  const errors = [];
  const warnings = [];
  const missing = [];
  const byId = new Map(store.adrs.map((a) => [a.id, a]));
  const logById = new Map();
  if (store.log) {
    const col = (name) => store.log.header.indexOf(name);
    for (const row of store.log.rows) {
      const id = adrId(row[col("adr")] ?? "");
      logById.set(id, { status: normalizeStatus(row[col("status")]), raw: row[col("status")], topic: col("topic") === -1 ? undefined : row[col("topic")], scope: globsOf(row[col("scope")] ?? "") });
    }
  } else if (store.adrs.length) errors.push(`${path.relative(store.project, store.adrDir) || "."}/README.md: the ADR log is missing`);

  for (const adr of store.adrs) {
    const name = path.relative(store.project, adr.file).replace(/\\/g, "/");
    const log = logById.get(adr.id);
    if (!log && store.log) errors.push(`${name}: no row in the ADR log`);
    if (adr.legacy) {
      missing.push({ id: adr.id, file: name, keys: REQUIRED });
      warnings.push(`${name}: no front matter (legacy ADR, read in full)`);
      continue;
    }
    const absent = REQUIRED.filter((k) => adr.front[k] === undefined || (Array.isArray(adr.front[k]) && adr.front[k].length === 0));
    if (absent.length) {
      missing.push({ id: adr.id, file: name, keys: absent });
      errors.push(`${name}: missing front matter ${absent.join(", ")}`);
    }
    const status = normalizeStatus(adr.front.status);
    if (adr.front.status !== undefined && !STATUSES.includes(status)) errors.push(`${name}: status must be one of ${STATUSES.join(", ")}`);
    if (adr.front.topic !== undefined && !TOPIC.test(String(adr.front.topic))) errors.push(`${name}: topic must be dot-separated lowercase, for example persistence.orm`);
    if (adr.front.decision !== undefined && (typeof adr.front.decision !== "string" || !adr.front.decision.trim())) errors.push(`${name}: decision must be one line of text`);
    if (adr.front.enforcedBy !== undefined && !ENFORCED.includes(String(adr.front.enforcedBy))) errors.push(`${name}: enforcedBy must be one of ${ENFORCED.join(", ")}`);
    if (log) {
      if (log.status !== status) errors.push(`${name}: status ${status} differs from the log (${log.raw})`);
      if (log.topic !== undefined && log.topic !== String(adr.front.topic ?? "")) errors.push(`${name}: topic ${adr.front.topic} differs from the log (${log.topic})`);
      const scope = scopeOf(adr);
      if (scope.length && log.scope.length && [...scope].sort().join(",") !== [...log.scope].sort().join(",")) errors.push(`${name}: scope differs from the log`);
    }
    for (const ref of asList(adr.front.supersedes).map(adrId)) {
      const target = byId.get(ref);
      if (!target) errors.push(`${name}: supersedes ${ref}, which does not exist`);
      else if (normalizeStatus(target.front?.status ?? logById.get(ref)?.status) !== "Superseded") errors.push(`${name}: supersedes ${ref}, but ${ref} is not Superseded`);
    }
    for (const ref of asList(adr.front.overrides).map(adrId)) {
      const target = byId.get(ref);
      if (!target) {
        errors.push(`${name}: overrides ${ref}, which does not exist`);
        continue;
      }
      if (normalizeStatus(target.front?.status) !== "Accepted") errors.push(`${name}: overrides ${ref}, which is not Accepted`);
      if (String(target.front?.topic) !== String(adr.front.topic)) errors.push(`${name}: overrides ${ref}, which has another topic`);
      if (!globsCover(scopeOf(target), scopeOf(adr))) errors.push(`${name}: overrides ${ref}, whose scope is not broader`);
    }
  }

  const accepted = store.adrs.filter((a) => !a.legacy && normalizeStatus(a.front.status) === "Accepted" && a.front.topic);
  const links = new Set(accepted.flatMap((a) => asList(a.front.overrides).map((r) => `${a.id}>${adrId(r)}`)));
  const collisions = [];
  for (let i = 0; i < accepted.length; i++) {
    for (let j = i + 1; j < accepted.length; j++) {
      const a = accepted[i];
      const b = accepted[j];
      if (String(a.front.topic) !== String(b.front.topic)) continue;
      if (!globsOverlap(scopeOf(a), scopeOf(b))) continue;
      if (links.has(`${a.id}>${b.id}`) || links.has(`${b.id}>${a.id}`)) continue;
      collisions.push([a.id, b.id]);
      errors.push(`${a.id} and ${b.id}: both Accepted with topic ${a.front.topic} and overlapping scopes, and no overrides link`);
    }
  }
  const groups = groupsOf(collisions, byId);

  for (const adr of store.adrs) {
    if (adr.legacy || normalizeStatus(adr.front.status) !== "Superseded") continue;
    if (!store.adrs.some((a) => !a.legacy && asList(a.front.supersedes).map(adrId).includes(adr.id))) warnings.push(`${adr.id}: Superseded, but no ADR lists it under supersedes`);
  }
  for (const rule of store.rules) {
    const name = path.relative(store.project, rule.file).replace(/\\/g, "/");
    if (!rule.front || !asList(rule.front.scope).length) errors.push(`${name}: rule file needs front matter scope`);
    if (!rule.front || !rule.front.summary) errors.push(`${name}: rule file needs front matter summary`);
  }
  return { errors, warnings, missing, groups };
}

function groupsOf(pairs, byId) {
  const parent = new Map();
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  for (const [a, b] of pairs) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()].map((ids) => ({ topic: String(byId.get(ids[0])?.front?.topic ?? ""), adrs: ids.sort() })).sort((x, y) => y.adrs.length - x.adrs.length);
}

// The binding ADR lines and rule lines for the given paths.
export function buildDigest(store, paths) {
  if (!store.exists) return { noStore: true, digest: [], blocked: [], legacy: [], enforced: [] };
  const files = paths.map((p) => p.replace(/\\/g, "/"));
  const accepted = store.adrs.filter((a) => !a.legacy && normalizeStatus(a.front.status) === "Accepted");
  const binding = new Map();
  const blocked = new Map();
  for (const file of files) {
    const hits = accepted.filter((a) => matches(scopeOf(a), file));
    const byTopic = new Map();
    for (const a of hits) {
      const topic = String(a.front.topic ?? a.id);
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push(a);
    }
    for (const [topic, group] of byTopic) {
      const overridden = new Set(group.flatMap((a) => asList(a.front.overrides).map(adrId)));
      const left = group.filter((a) => !overridden.has(a.id));
      if (left.length === 1) binding.set(left[0].id, left[0]);
      else {
        const key = `${topic}:${left.map((a) => a.id).sort().join(",")}`;
        if (!blocked.has(key)) blocked.set(key, { topic, adrs: left.map((a) => a.id).sort(), paths: [] });
        blocked.get(key).paths.push(file);
      }
    }
  }
  const digest = [];
  const enforced = [];
  for (const adr of [...binding.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    digest.push({ source: adr.id, topic: String(adr.front.topic), line: String(adr.front.decision) });
    if (String(adr.front.enforcedBy ?? "none") !== "none") {
      enforced.push({ source: adr.id, by: String(adr.front.enforcedBy) });
      continue;
    }
    for (const line of adr.consequences) digest.push({ source: adr.id, topic: String(adr.front.topic), line });
  }
  for (const rule of store.rules) {
    if (!rule.front || !files.some((f) => matches(asList(rule.front.scope), f))) continue;
    for (const line of rule.lines) digest.push({ source: `rules/${rule.name}`, topic: "rule", line });
  }
  const legacy = store.adrs.filter((a) => a.legacy).map((a) => ({ id: a.id, file: path.relative(store.project, a.file).replace(/\\/g, "/") }));
  return { noStore: false, digest, blocked: [...blocked.values()], legacy, enforced };
}

function usage(message) {
  process.stderr.write(`${message}\nUsage: node check-store.mjs <project> [--adr <dir>] [--rules <dir>] [--json] [--digest <path>...]\n`);
  process.exit(2);
}

function main(argv) {
  const args = [...argv];
  const options = {};
  let project;
  let json = false;
  let digestPaths = null;
  while (args.length) {
    const a = args.shift();
    if (a === "--adr" || a === "--rules") {
      const v = args.shift();
      if (!v) usage(`${a} needs a directory`);
      options[a.slice(2)] = v;
    } else if (a === "--json") json = true;
    else if (a === "--digest") {
      digestPaths = args.splice(0);
    } else if (!project) project = a;
    else usage(`unexpected argument ${a}`);
  }
  if (!project) usage("the project directory is missing");
  if (!fs.existsSync(project)) usage(`${project} does not exist`);
  const store = loadStore(project, options);
  if (digestPaths) {
    process.stdout.write(`${JSON.stringify(buildDigest(store, digestPaths), null, 2)}\n`);
    return 0;
  }
  if (!store.exists) {
    if (json) process.stdout.write(`${JSON.stringify({ noStore: true, errors: [], warnings: [], missing: [], groups: [] }, null, 2)}\n`);
    else process.stdout.write("no-store: neither the ADR nor the rules directory exists\n");
    return 0;
  }
  const result = checkStore(store);
  if (json) process.stdout.write(`${JSON.stringify({ noStore: false, ...result }, null, 2)}\n`);
  else {
    for (const e of result.errors) process.stdout.write(`error: ${e}\n`);
    for (const w of result.warnings) process.stdout.write(`warning: ${w}\n`);
    process.stdout.write(result.errors.length ? `${result.errors.length} error(s)\n${FIX_HINT}\n` : "store is valid\n");
  }
  return result.errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
