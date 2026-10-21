import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const files = {
  targets: "targets.json",
  exclusions: "exclusions.json",
  rejections: "consolidation-rejections.json",
  lineage: "lineage.json",
};
const emptyState = {
  targets: { schemaVersion: 1, olko: null, default: null, targets: {}, leakTerms: [] },
  exclusions: { schemaVersion: 1, entries: [] },
  rejections: { schemaVersion: 1, retryAfterDays: 30, rejected: [] },
  lineage: { schemaVersion: 1, capabilities: {} },
};
const stores = new Set(["target", "olko", "user", "project"]);
const exclusionKinds = new Set(["pinned", "rejected-new"]);
const dayMs = 24 * 60 * 60 * 1000;

function usage() {
  console.error(`Usage: node sync-state.mjs <command> [options] [--state-dir <path>]
  init
  target get [--name <name>]
  target set --name <name> --path <path> [--kind <kind>] [--default]
  target set-olko --path <path>
  target add-leak-term --term <term>
  exclusion list
  exclusion add --artifact <kind:name> --reason <text> [--scope all|<store>-><store>] [--kind pinned|rejected-new] [--version <semver>]
  exclusion remove --artifact <kind:name> [--scope <scope>]
  exclusion check --artifact <kind:name> --direction <store>-><store> [--version <semver>]
  rejection list [--due] [--now <YYYY-MM-DD>]
  rejection add --items <a,b[,c]> --suggestion <merge|remove|extend> [--reason <text>] [--now <YYYY-MM-DD>]
  rejection check --items <a,b[,c]> [--now <YYYY-MM-DD>]
  lineage get [--capability <id>]
  lineage set --capability <id> --store <store> --path <path> --hash <sha256> [--ported-from <store@hash>] [--canonical <store>]
  hash --path <dir-or-file>`);
}

function parseArgs(args) {
  const result = { positional: [], options: {} };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      result.positional.push(argument);
      continue;
    }
    const key = argument.slice(2);
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) {
      result.options[key] = true;
    } else {
      result.options[key] = next;
      index += 1;
    }
  }
  return result;
}

function requireOption(options, key) {
  const value = options[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required --${key}`);
  }
  return value.trim();
}

export function resolveStateDir(options = {}) {
  if (typeof options["state-dir"] === "string") {
    return path.resolve(options["state-dir"]);
  }
  if (process.env.OLKO_SYNC_HOME) {
    return path.resolve(process.env.OLKO_SYNC_HOME);
  }
  return path.join(os.homedir(), ".olko-sync");
}

function load(stateDir, key) {
  const filePath = path.join(stateDir, files[key]);
  if (!fs.existsSync(filePath)) {
    return structuredClone(emptyState[key]);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function save(stateDir, key, value) {
  fs.mkdirSync(stateDir, { recursive: true });
  const filePath = path.join(stateDir, files[key]);
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function today(options) {
  const value = typeof options.now === "string" ? options.now : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`Invalid date: ${value}`);
  }
  return value;
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}

function validateArtifact(artifact) {
  if (!/^(skill|agent):[a-z0-9]+([-:][a-z0-9]+)*$/.test(artifact)) {
    throw new Error(`Artifact must look like skill:<name> or agent:<name>: ${artifact}`);
  }
  return artifact;
}

function validateDirection(direction) {
  const [from, to, ...rest] = direction.split("->");
  if (rest.length > 0 || !stores.has(from) || !stores.has(to) || from === to) {
    throw new Error(`Direction must be <store>-><store> with stores ${[...stores].join(", ")}: ${direction}`);
  }
  return direction;
}

function validateScope(scope) {
  return scope === "all" ? scope : validateDirection(scope);
}

export function normalizeItems(value) {
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].sort();
  if (items.length < 2) {
    throw new Error("--items needs at least two distinct artifacts");
  }
  return items;
}

export function findExclusion(exclusions, artifact, direction, version) {
  return exclusions.entries.find((entry) => {
    if (entry.artifact !== artifact || (entry.scope !== "all" && entry.scope !== direction)) {
      return false;
    }
    return entry.kind !== "rejected-new" || entry.version === version;
  });
}

export function rejectionStatus(rejections, items, now) {
  const key = items.join(",");
  const retryAfterDays = rejections.retryAfterDays ?? 30;
  const matches = rejections.rejected
    .filter((entry) => entry.items.join(",") === key)
    .sort((left, right) => right.rejectedAt.localeCompare(left.rejectedAt));
  if (matches.length === 0) {
    return { status: "due" };
  }
  const askAgainAfter = addDays(matches[0].rejectedAt, retryAfterDays);
  return askAgainAfter <= now
    ? { status: "due", lastRejectedAt: matches[0].rejectedAt }
    : { status: "suppressed", lastRejectedAt: matches[0].rejectedAt, askAgainAfter };
}

export function hashPath(target) {
  const hash = crypto.createHash("sha256");
  const root = path.resolve(target);
  const entries = fs.statSync(root).isDirectory()
    ? fs.readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
    : [root];
  for (const file of entries.map((entry) => path.relative(root, entry).split(path.sep).join("/")).sort()) {
    hash.update(`${file}\n`);
    hash.update(fs.readFileSync(path.join(root, file)).toString("utf8").replace(/\r\n/g, "\n"));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function print(value) {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function runTarget(stateDir, action, options) {
  const targets = load(stateDir, "targets");
  if (action === "get") {
    if (typeof options.name === "string") {
      const target = targets.targets[options.name];
      if (!target) {
        throw new Error(`Unknown target: ${options.name}`);
      }
      return print({ name: options.name, ...target });
    }
    return print(targets);
  }
  if (action === "set") {
    const name = requireOption(options, "name");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      throw new Error(`Target name must be lowercase kebab-case: ${name}`);
    }
    targets.targets[name] = {
      path: path.resolve(requireOption(options, "path")),
      kind: typeof options.kind === "string" ? options.kind : "claude-plugin-marketplace",
    };
    if (options.default === true || targets.default === null) {
      targets.default = name;
    }
    save(stateDir, "targets", targets);
    return print(`target ${name} saved`);
  }
  if (action === "set-olko") {
    targets.olko = { path: path.resolve(requireOption(options, "path")) };
    save(stateDir, "targets", targets);
    return print("olko marketplace path saved");
  }
  if (action === "add-leak-term") {
    const term = requireOption(options, "term");
    if (!targets.leakTerms.includes(term)) {
      targets.leakTerms.push(term);
      save(stateDir, "targets", targets);
    }
    return print("leak term saved");
  }
  throw new Error(`Unknown target action: ${action}`);
}

function runExclusion(stateDir, action, options) {
  const exclusions = load(stateDir, "exclusions");
  if (action === "list") {
    return print(exclusions.entries);
  }
  if (action === "add") {
    const kind = typeof options.kind === "string" ? options.kind : "pinned";
    if (!exclusionKinds.has(kind)) {
      throw new Error(`Exclusion kind must be pinned or rejected-new: ${kind}`);
    }
    const entry = {
      artifact: validateArtifact(requireOption(options, "artifact")),
      scope: validateScope(typeof options.scope === "string" ? options.scope : "all"),
      kind,
      reason: requireOption(options, "reason"),
      addedAt: today(options),
    };
    if (kind === "rejected-new") {
      entry.version = requireOption(options, "version");
    }
    exclusions.entries = exclusions.entries.filter(
      (existing) => !(existing.artifact === entry.artifact && existing.scope === entry.scope),
    );
    exclusions.entries.push(entry);
    save(stateDir, "exclusions", exclusions);
    return print(`excluded ${entry.artifact} (${entry.scope})`);
  }
  if (action === "remove") {
    const artifact = validateArtifact(requireOption(options, "artifact"));
    const before = exclusions.entries.length;
    exclusions.entries = exclusions.entries.filter(
      (entry) => entry.artifact !== artifact || (typeof options.scope === "string" && entry.scope !== options.scope),
    );
    save(stateDir, "exclusions", exclusions);
    return print(`removed ${before - exclusions.entries.length} exclusion(s) for ${artifact}`);
  }
  if (action === "check") {
    const artifact = validateArtifact(requireOption(options, "artifact"));
    const direction = validateDirection(requireOption(options, "direction"));
    const version = typeof options.version === "string" ? options.version : undefined;
    const match = findExclusion(exclusions, artifact, direction, version);
    return print(match ? { status: "excluded", ...match } : { status: "active", artifact, direction });
  }
  throw new Error(`Unknown exclusion action: ${action}`);
}

function runRejection(stateDir, action, options) {
  const rejections = load(stateDir, "rejections");
  const now = today(options);
  if (action === "list") {
    const rows = rejections.rejected.map((entry) => ({
      ...entry,
      ...rejectionStatus(rejections, entry.items, now),
    }));
    return print(options.due === true ? rows.filter((row) => row.status === "due") : rows);
  }
  if (action === "add") {
    const suggestion = requireOption(options, "suggestion");
    if (!["merge", "remove", "extend"].includes(suggestion)) {
      throw new Error(`Suggestion must be merge, remove, or extend: ${suggestion}`);
    }
    const entry = {
      items: normalizeItems(requireOption(options, "items")),
      suggestion,
      rejectedAt: now,
    };
    if (typeof options.reason === "string") {
      entry.reason = options.reason;
    }
    rejections.rejected.push(entry);
    save(stateDir, "rejections", rejections);
    return print(`rejection saved; ask again after ${addDays(now, rejections.retryAfterDays ?? 30)}`);
  }
  if (action === "check") {
    return print(rejectionStatus(rejections, normalizeItems(requireOption(options, "items")), now));
  }
  throw new Error(`Unknown rejection action: ${action}`);
}

function runLineage(stateDir, action, options) {
  const lineage = load(stateDir, "lineage");
  if (action === "get") {
    if (typeof options.capability === "string") {
      return print(lineage.capabilities[options.capability] ?? null);
    }
    return print(lineage);
  }
  if (action === "set") {
    const capability = requireOption(options, "capability");
    const store = requireOption(options, "store");
    if (!stores.has(store)) {
      throw new Error(`Unknown store: ${store}`);
    }
    const record = lineage.capabilities[capability] ?? { canonical: null, copies: {} };
    record.copies[store] = { path: requireOption(options, "path"), hash: requireOption(options, "hash"), updatedAt: today(options) };
    if (typeof options["ported-from"] === "string") {
      record.copies[store].portedFrom = options["ported-from"];
    }
    if (typeof options.canonical === "string") {
      if (!stores.has(options.canonical)) {
        throw new Error(`Unknown canonical store: ${options.canonical}`);
      }
      record.canonical = options.canonical;
    }
    lineage.capabilities[capability] = record;
    save(stateDir, "lineage", lineage);
    return print(`lineage ${capability}/${store} saved`);
  }
  throw new Error(`Unknown lineage action: ${action}`);
}

function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const [command, action] = positional;
  const stateDir = resolveStateDir(options);

  if (command === "init") {
    for (const key of Object.keys(files)) {
      if (!fs.existsSync(path.join(stateDir, files[key]))) {
        save(stateDir, key, emptyState[key]);
      }
    }
    return print(`state ready at ${stateDir}`);
  }
  if (command === "target") {
    return runTarget(stateDir, action, options);
  }
  if (command === "exclusion") {
    return runExclusion(stateDir, action, options);
  }
  if (command === "rejection") {
    return runRejection(stateDir, action, options);
  }
  if (command === "lineage") {
    return runLineage(stateDir, action, options);
  }
  if (command === "hash") {
    return print(hashPath(requireOption(options, "path")));
  }
  throw new Error(`Unknown command: ${command ?? "(none)"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
  }
}
