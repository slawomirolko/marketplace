/**
 * Provenance lock for marketplace artifacts installed in a project.
 *
 * `.agents/marketplace.lock.json` records, per installed skill or agent, the marketplace version and
 * commit it came from and a content hash that leaves out the project adaptation layer. `status` then
 * tells a local change from an old version, which the installers cannot do.
 *
 * What is installed, its portable content, its version and its marketplace history come from the
 * installed-artifact model of the olko-factory-project skill, so this lock and the project status
 * scan agree on every copy.
 *
 * This is a marketplace gate: it runs from a marketplace checkout (`<marketplace>/scripts/`), never
 * from an installed skill. See "Script ownership" in docs/project-change-upstream.md.
 *
 * Usage:
 *   node scripts/olko-marketplace-lock.mjs init   --project <dir> --marketplace <dir> [--depth <n>] [--json]
 *   node scripts/olko-marketplace-lock.mjs status --project <dir> --marketplace <dir> [--depth <n>] [--json]
 *   node scripts/olko-marketplace-lock.mjs record --project <dir> --artifact <skill:x|agent:x>
 *        (--pending-pr <n> --content-hash <sha256> | --clear-pending | --rejected <sha256>) [--json]
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AGENT_MANIFEST_FILE,
  DEFAULT_DEPTH,
  HASH_PREFIX,
  LOCAL_REF,
  REGISTRY_FILE,
  compare,
  copyAt,
  copyAtLocation,
  installedArtifacts as installedCopies,
  marketplacePath,
  marketplaceVersions,
} from "../skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs";
import { parseFlags, readJson } from "./lib/cli.mjs";

export { HASH_PREFIX, hashFiles, isAdapterFile, normalizeText, stripModelLine } from "../skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs";

export const LOCK_SCHEMA_VERSION = 1;
export const LOCK_PATH = path.join(".agents", "marketplace.lock.json");
/** The `base` of a lock entry whose copy matches no marketplace version. */
const UNKNOWN_BASE = "unknown";
/** The lock key that holds the schema version; every other key is an artifact id. */
const SCHEMA_KEY = "schemaVersion";
/** A content hash as `status` reports it and `record` takes it: bare SHA-256 hex, without HASH_PREFIX. */
const BARE_HASH = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const COMMANDS = ["init", "status", "record"];

/** A skill, agent or category name, or an agent file name: no path separators, no leading dot or underscore. */
export const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** `skill:<name>` or `agent:<name>` with a valid name; rejects __proto__ and other object keys. */
export function isArtifactId(id) {
  if (typeof id !== "string") {
    return false;
  }
  const match = id.match(/^(skill|agent):(.+)$/);
  return Boolean(match) && NAME_PATTERN.test(match[2]);
}

/** Joins `parts` under `root` and refuses a result outside it. */
function insideProject(root, ...parts) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...parts);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("An artifact path leaves the project");
  }
  return resolved;
}

function requireName(value) {
  if (typeof value !== "string" || !NAME_PATTERN.test(value)) {
    throw new Error("The marketplace lists an invalid artifact name");
  }
  return value;
}

/** Refuses a marketplace whose registry or agent manifest lists a name that is not a plain name. */
function checkMarketplaceIndexes(marketplace) {
  const registryPath = path.join(marketplace, REGISTRY_FILE);
  if (fs.existsSync(registryPath)) {
    for (const skill of readJson(registryPath).skills ?? []) {
      requireName(skill.name);
      requireName(skill.category);
    }
  }
  const manifestPath = path.join(marketplace, ...AGENT_MANIFEST_FILE.split("/"));
  if (fs.existsSync(manifestPath)) {
    for (const agent of readJson(manifestPath).agents ?? []) {
      requireName(agent.name);
      requireName(agent.file);
    }
  }
}

/**
 * Every artifact installed in the project that the marketplace HEAD has, one per id: the first copy in
 * the shared LOCATIONS order (`.agents/skills` before `.claude/skills` and `.opencode/skills`;
 * `.opencode/agents` before `.claude/agents`).
 */
function installedArtifacts(project, marketplace) {
  checkMarketplaceIndexes(marketplace);
  const artifacts = new Map();
  for (const copy of installedCopies(project)) {
    const id = `${copy.kind}:${copy.name}`;
    if (artifacts.has(id)) {
      continue;
    }
    const source = marketplacePath(marketplace, copy, LOCAL_REF);
    if (source?.present) {
      artifacts.set(id, { id, copy, source: source.path });
    }
  }
  return [...artifacts.values()];
}

/**
 * The lock entry of one installed artifact: the shared comparison with its marketplace history at HEAD.
 * A `modified` copy records its guessed base version and that version's hashes; a copy with a known base
 * records its own hashes; a copy without a base records `base: "unknown"` and the nearest version.
 */
function lockEntry(marketplace, artifact, depth) {
  const { copy, source } = artifact;
  const { versions, truncated } = marketplaceVersions(marketplace, copy.kind, source, depth, LOCAL_REF);
  const result = compare(copy, versions, true, { truncated });
  const common = { kind: copy.kind, source, location: copy.location, state: result.state };
  const tracking = { pending: null, rejected: [] };
  if (result.state === "modified") {
    const base = result.base;
    return { ...common, version: base.version, sourceCommit: base.commit, baseGuessed: true, hash: base.contentHash, files: base.files, ...tracking };
  }
  if (result.base) {
    return { ...common, version: result.base.version, sourceCommit: result.base.commit, hash: copy.contentHash, files: copy.files, ...tracking };
  }
  const nearest = result.nearest?.version ?? null;
  return {
    ...common,
    version: null,
    sourceCommit: null,
    base: UNKNOWN_BASE,
    nearestVersion: nearest?.version ?? null,
    nearestCommit: nearest?.commit ?? null,
    hash: copy.contentHash,
    files: nearest ? nearest.files : copy.files,
    ...tracking,
  };
}

export function lockFilePath(project) {
  return path.join(project, LOCK_PATH);
}

/** The project's lock, or null when it has none; throws on another schema version. */
export function readLock(project) {
  const file = lockFilePath(project);
  if (!fs.existsSync(file)) {
    return null;
  }
  const lock = readJson(file);
  if (lock.schemaVersion !== LOCK_SCHEMA_VERSION) {
    throw new Error(`Unsupported lock schemaVersion ${lock.schemaVersion}`);
  }
  return lock;
}

/** Writes the lock through a temporary file, so a crash never leaves half a lock. */
function writeLock(project, lock) {
  const file = lockFilePath(project);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(lock, null, 2)}\n`);
  fs.renameSync(temp, file);
}

/** Writes a new lock for every installed artifact; keeps the `pending` and `rejected` records of the previous lock. */
export function init(project, marketplace, { depth = DEFAULT_DEPTH } = {}) {
  const previous = readLock(project);
  const lock = { schemaVersion: LOCK_SCHEMA_VERSION };
  for (const artifact of installedArtifacts(project, marketplace)) {
    const entry = lockEntry(marketplace, artifact, depth);
    if (previous && Object.hasOwn(previous, artifact.id)) {
      entry.pending = previous[artifact.id].pending ?? null;
      entry.rejected = previous[artifact.id].rejected ?? [];
    }
    lock[artifact.id] = entry;
  }
  writeLock(project, lock);
  return lock;
}

/**
 * The installed path of a lock entry: its `location` (a shared LOCATIONS folder) or, for entries written
 * before `location` existed, `.agents/skills/<name>` and `.opencode/agents/<source file>`.
 */
function localPathOf(project, kind, name, entry) {
  if (entry.location !== undefined) {
    const found = typeof entry.location === "string" ? copyAtLocation(project, kind, name, entry.location) : null;
    if (!found) {
      throw new Error("The lock holds an invalid artifact location");
    }
    return insideProject(project, ...entry.location.split("/"));
  }
  if (kind === "skill") {
    return insideProject(project, ".agents", "skills", name);
  }
  return insideProject(project, ".opencode", "agents", requireName(path.posix.basename(entry.source)));
}

function artifactFromEntry(project, id, entry) {
  if (!isArtifactId(id) || typeof entry?.source !== "string") {
    throw new Error("The lock holds an invalid artifact id");
  }
  const [kind, name] = id.split(":");
  return { id, kind, name, local: localPathOf(project, kind, name, entry), source: entry.source, location: entry.location };
}

/** The files whose hash differs between the installed copy and the lock entry, sorted. */
function changedFiles(current, entry) {
  const names = new Set([...Object.keys(current.files), ...Object.keys(entry.files ?? {})]);
  return [...names].filter((name) => current.files[name] !== entry.files?.[name]).sort();
}

/** The `status` record of one changed artifact, with the latest marketplace version for `upstreamMoved`. */
function describeChange(marketplace, artifact, entry, current, files) {
  const unknownBase = entry.base === UNKNOWN_BASE;
  const latest = marketplaceVersions(marketplace, artifact.kind, artifact.source, 1, LOCAL_REF).versions[0];
  const baseHash = unknownBase ? null : entry.hash;
  const contentHash = current.contentHash.slice(HASH_PREFIX.length);
  return {
    artifact: artifact.id,
    base: unknownBase ? UNKNOWN_BASE : entry.version,
    nearestVersion: entry.nearestVersion ?? entry.version,
    files,
    contentHash,
    upstreamMoved: Boolean(latest && latest.contentHash !== baseHash),
    latestVersion: latest?.version ?? null,
    pending: entry.pending ?? null,
    rejected: (entry.rejected ?? []).includes(contentHash),
  };
}

/**
 * Compares every locked artifact with its installed copy: `changed` (with the differing files),
 * `missing` (no copy at its path) and `untracked` (installed and in the marketplace, but not locked).
 * A copy with an unknown base is compared file by file even when its hash equals the lock hash.
 */
export function status(project, marketplace) {
  const lock = readLock(project);
  if (!lock) {
    throw new Error(`No ${LOCK_PATH} in the project. Run init first.`);
  }
  const changed = [];
  const missing = [];
  for (const [id, entry] of Object.entries(lock)) {
    if (id === SCHEMA_KEY) {
      continue;
    }
    const artifact = artifactFromEntry(project, id, entry);
    if (!fs.existsSync(artifact.local)) {
      missing.push(id);
      continue;
    }
    const current = copyAt(artifact.kind, artifact.name, null, artifact.location ?? null, artifact.local);
    if (current.contentHash === entry.hash && entry.base !== UNKNOWN_BASE) {
      continue;
    }
    const files = changedFiles(current, entry);
    if (files.length > 0) {
      changed.push(describeChange(marketplace, artifact, entry, current, files));
    }
  }
  const tracked = new Set(Object.keys(lock));
  const untracked = installedArtifacts(project, marketplace).map((artifact) => artifact.id).filter((id) => !tracked.has(id));
  return { changed, missing, untracked };
}

/** Records a pending PR, clears it, or records a rejected content hash (which also clears a matching pending PR). */
export function record(project, artifact, options) {
  const lock = readLock(project);
  if (!isArtifactId(artifact) || !lock || !Object.hasOwn(lock, artifact)) {
    throw new Error(`The artifact is not in ${LOCK_PATH}`);
  }
  const entry = lock[artifact];
  if (options.clearPending) {
    entry.pending = null;
  }
  if (options.pendingPr) {
    if (!BARE_HASH.test(options.contentHash ?? "")) {
      throw new Error("--pending-pr needs --content-hash <sha256>");
    }
    if (!POSITIVE_INTEGER.test(options.pendingPr)) {
      throw new Error("--pending-pr needs a positive PR number");
    }
    entry.pending = { pr: Number(options.pendingPr), contentHash: options.contentHash };
  }
  if (options.rejected) {
    if (!BARE_HASH.test(options.rejected)) {
      throw new Error("--rejected needs a sha256 content hash");
    }
    entry.rejected = [...new Set([...(entry.rejected ?? []), options.rejected])];
    if (entry.pending?.contentHash === options.rejected) {
      entry.pending = null;
    }
  }
  writeLock(project, lock);
  return entry;
}

const FLAGS = {
  values: { "--project": "project", "--marketplace": "marketplace", "--artifact": "artifact", "--pending-pr": "pendingPr", "--content-hash": "contentHash", "--rejected": "rejected", "--depth": "depth" },
  switches: { "--json": "json", "--clear-pending": "clearPending" },
};

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = parseFlags(rest, FLAGS, { command });
  if (!options.project) {
    throw new Error("Missing --project <dir>");
  }
  if (command !== "record" && !options.marketplace) {
    throw new Error("Missing --marketplace <dir>");
  }
  if (options.depth !== undefined && !POSITIVE_INTEGER.test(options.depth)) {
    throw new Error("--depth must be a positive integer");
  }
  return options;
}

function print(value, json) {
  console.log(json ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const project = path.resolve(options.project);
  const marketplace = options.marketplace ? path.resolve(options.marketplace) : null;
  if (!COMMANDS.includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}. Use init, status or record.`);
  }
  const run = {
    init: () => init(project, marketplace, { depth: options.depth ? Number(options.depth) : DEFAULT_DEPTH }),
    status: () => status(project, marketplace),
    record: () => record(project, options.artifact, options),
  };
  print(run[options.command](), options.json);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
