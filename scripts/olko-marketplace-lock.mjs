// Provenance lock for marketplace artifacts installed in a project.
//
// `.agents/marketplace.lock.json` records, per installed skill or agent, the
// marketplace version and commit it came from and a content hash that leaves
// out the project adaptation layer. `status` then tells a local change from an
// old version, which the installers cannot do.
//
// Usage:
//   node scripts/olko-marketplace-lock.mjs init   --project <dir> --marketplace <dir> [--json]
//   node scripts/olko-marketplace-lock.mjs status --project <dir> --marketplace <dir> [--json]
//   node scripts/olko-marketplace-lock.mjs record --project <dir> --artifact <skill:x|agent:x>
//        (--pending-pr <n> --content-hash <sha256> | --clear-pending | --rejected <sha256>) [--json]

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LOCK_SCHEMA_VERSION = 1;
export const LOCK_PATH = path.join(".agents", "marketplace.lock.json");

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

// Files inside an installed skill directory that belong to the project, not to the marketplace.
export function isAdapterFile(relativePath) {
  const name = relativePath.split("/").pop();
  return relativePath === "project.md" || /\.local\./.test(name);
}

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

// The model binding is chosen per project, so it never counts as an agent change.
export function normalizeAgent(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return normalized;
  const frontmatter = match[1].split("\n").filter((line) => !/^model:/.test(line)).join("\n");
  return `---\n${frontmatter}\n---\n${normalized.slice(match[0].length)}`;
}

function sha(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// files: Map of relative path -> content. Returns { hash, files: {path: sha256} }.
export function hashFiles(files) {
  const perFile = {};
  const total = crypto.createHash("sha256");
  for (const name of [...files.keys()].sort()) {
    const content = files.get(name);
    perFile[name] = sha(content);
    total.update(`${name}\n${content}\n`);
  }
  return { hash: `sha256:${total.digest("hex")}`, files: perFile };
}

function readDirFiles(dir) {
  const files = new Map();
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
    const relative = path.relative(dir, absolute).split(path.sep).join("/");
    if (isAdapterFile(relative)) continue;
    files.set(relative, normalize(fs.readFileSync(absolute, "utf8")));
  }
  return files;
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function gitShowJson(marketplace, commit, file) {
  const result = spawnSync("git", ["show", `${commit}:${file}`], { cwd: marketplace, encoding: "utf8" });
  return result.status === 0 ? JSON.parse(result.stdout) : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Every artifact of the marketplace HEAD that is also installed in the project.
function installedArtifacts(project, marketplace) {
  const artifacts = [];
  const registryPath = path.join(marketplace, "registry.json");
  if (fs.existsSync(registryPath)) {
    for (const skill of readJson(registryPath).skills ?? []) {
      requireName(skill.name);
      requireName(skill.category);
      const local = insideProject(project, ".agents", "skills", skill.name);
      if (fs.existsSync(path.join(local, "SKILL.md"))) {
        artifacts.push({ id: `skill:${skill.name}`, kind: "skill", name: skill.name, local, source: `skills/${skill.category}/${skill.name}` });
      }
    }
  }
  const manifestPath = path.join(marketplace, "agents", "opencode", "index.json");
  if (fs.existsSync(manifestPath)) {
    for (const agent of readJson(manifestPath).agents ?? []) {
      requireName(agent.name);
      requireName(agent.file);
      const local = insideProject(project, ".opencode", "agents", agent.file);
      if (fs.existsSync(local)) {
        artifacts.push({ id: `agent:${agent.name}`, kind: "agent", name: agent.name, local, source: `agents/opencode/${agent.file}` });
      }
    }
  }
  return artifacts;
}

function localFiles(artifact) {
  if (artifact.kind === "skill") return readDirFiles(artifact.local);
  return new Map([[path.basename(artifact.local), normalizeAgent(fs.readFileSync(artifact.local, "utf8"))]]);
}

function filesAtCommit(marketplace, commit, artifact) {
  const files = new Map();
  if (artifact.kind === "agent") {
    const result = spawnSync("git", ["show", `${commit}:${artifact.source}`], { cwd: marketplace, encoding: "utf8" });
    if (result.status === 0) files.set(path.basename(artifact.local), normalizeAgent(result.stdout));
    return files;
  }
  const listed = git(marketplace, ["ls-tree", "-r", "--name-only", commit, "--", `${artifact.source}/`]);
  for (const file of listed.split("\n").filter(Boolean)) {
    const relative = file.slice(artifact.source.length + 1);
    if (isAdapterFile(relative)) continue;
    files.set(relative, normalize(git(marketplace, ["show", `${commit}:${file}`])));
  }
  return files;
}

function versionAtCommit(marketplace, commit, artifact) {
  if (artifact.kind === "skill") {
    const registry = gitShowJson(marketplace, commit, "registry.json");
    return registry?.skills?.find((skill) => skill.name === artifact.name)?.version ?? null;
  }
  const manifest = gitShowJson(marketplace, commit, "agents/opencode/index.json");
  return manifest?.agents?.find((agent) => agent.name === artifact.name)?.version ?? null;
}

// Marketplace history of one artifact, newest first: [{commit, version, hash, files}].
function history(marketplace, artifact) {
  const commits = git(marketplace, ["log", "--format=%H", "--", artifact.source]).split("\n").filter(Boolean);
  return commits.map((commit) => {
    const files = filesAtCommit(marketplace, commit, artifact);
    return { commit, version: versionAtCommit(marketplace, commit, artifact), contents: files, ...hashFiles(files) };
  });
}

function lineDistance(a, b) {
  let distance = 0;
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    const left = (a.get(name) ?? "").split("\n");
    const right = new Set((b.get(name) ?? "").split("\n"));
    const leftSet = new Set(left);
    distance += left.filter((line) => !right.has(line)).length;
    distance += [...right].filter((line) => !leftSet.has(line)).length;
  }
  return distance;
}

function lockEntry(marketplace, artifact) {
  const current = localFiles(artifact);
  const { hash, files } = hashFiles(current);
  const versions = history(marketplace, artifact);
  const match = versions.find((entry) => entry.hash === hash);
  if (match) {
    return { kind: artifact.kind, source: artifact.source, version: match.version, sourceCommit: match.commit, hash, files, pending: null, rejected: [] };
  }
  const nearest = [...versions].sort((a, b) => lineDistance(current, a.contents) - lineDistance(current, b.contents))[0];
  return {
    kind: artifact.kind,
    source: artifact.source,
    version: null,
    sourceCommit: null,
    base: "unknown",
    nearestVersion: nearest?.version ?? null,
    nearestCommit: nearest?.commit ?? null,
    hash,
    files: nearest ? nearest.files : files,
    pending: null,
    rejected: [],
  };
}

export function lockFilePath(project) {
  return path.join(project, LOCK_PATH);
}

export function readLock(project) {
  const file = lockFilePath(project);
  if (!fs.existsSync(file)) return null;
  const lock = readJson(file);
  if (lock.schemaVersion !== LOCK_SCHEMA_VERSION) throw new Error(`Unsupported lock schemaVersion ${lock.schemaVersion}`);
  return lock;
}

function writeLock(project, lock) {
  const file = lockFilePath(project);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(lock, null, 2)}\n`);
  fs.renameSync(temp, file);
}

export function init(project, marketplace) {
  const previous = readLock(project);
  const lock = { schemaVersion: LOCK_SCHEMA_VERSION };
  for (const artifact of installedArtifacts(project, marketplace)) {
    const entry = lockEntry(marketplace, artifact);
    // Keep decisions already recorded for this artifact.
    if (previous && Object.hasOwn(previous, artifact.id)) {
      entry.pending = previous[artifact.id].pending ?? null;
      entry.rejected = previous[artifact.id].rejected ?? [];
    }
    lock[artifact.id] = entry;
  }
  writeLock(project, lock);
  return lock;
}

function artifactFromEntry(project, id, entry) {
  if (!isArtifactId(id) || typeof entry?.source !== "string") {
    throw new Error("The lock holds an invalid artifact id");
  }
  const [kind, name] = id.split(":");
  const local = kind === "skill"
    ? insideProject(project, ".agents", "skills", name)
    : insideProject(project, ".opencode", "agents", requireName(path.posix.basename(entry.source)));
  return { id, kind, name, local, source: entry.source };
}

export function status(project, marketplace) {
  const lock = readLock(project);
  if (!lock) throw new Error(`No ${LOCK_PATH} in the project. Run init first.`);
  const changed = [];
  const missing = [];
  for (const [id, entry] of Object.entries(lock)) {
    if (id === "schemaVersion") continue;
    const artifact = artifactFromEntry(project, id, entry);
    if (!fs.existsSync(artifact.local)) {
      missing.push(id);
      continue;
    }
    const current = hashFiles(localFiles(artifact));
    if (current.hash === entry.hash && entry.base !== "unknown") continue;
    const names = new Set([...Object.keys(current.files), ...Object.keys(entry.files ?? {})]);
    const files = [...names].filter((name) => current.files[name] !== entry.files?.[name]).sort();
    if (files.length === 0) continue;
    const latest = history(marketplace, artifact)[0];
    const baseHash = entry.base === "unknown" ? null : entry.hash;
    changed.push({
      artifact: id,
      base: entry.base === "unknown" ? "unknown" : entry.version,
      nearestVersion: entry.nearestVersion ?? entry.version,
      files,
      contentHash: current.hash.slice("sha256:".length),
      upstreamMoved: Boolean(latest && latest.hash !== baseHash),
      latestVersion: latest?.version ?? null,
      pending: entry.pending ?? null,
      rejected: (entry.rejected ?? []).includes(current.hash.slice("sha256:".length)),
    });
  }
  const tracked = new Set(Object.keys(lock));
  const untracked = installedArtifacts(project, marketplace).map((artifact) => artifact.id).filter((id) => !tracked.has(id));
  return { changed, missing, untracked };
}

export function record(project, artifact, options) {
  const lock = readLock(project);
  if (!isArtifactId(artifact) || !lock || !Object.hasOwn(lock, artifact)) {
    throw new Error(`The artifact is not in ${LOCK_PATH}`);
  }
  const entry = lock[artifact];
  if (options.clearPending) entry.pending = null;
  if (options.pendingPr) {
    if (!/^[0-9a-f]{64}$/.test(options.contentHash ?? "")) throw new Error("--pending-pr needs --content-hash <sha256>");
    entry.pending = { pr: Number(options.pendingPr), contentHash: options.contentHash };
  }
  if (options.rejected) {
    if (!/^[0-9a-f]{64}$/.test(options.rejected)) throw new Error("--rejected needs a sha256 content hash");
    entry.rejected = [...new Set([...(entry.rejected ?? []), options.rejected])];
    if (entry.pending?.contentHash === options.rejected) entry.pending = null;
  }
  writeLock(project, lock);
  return entry;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  const flags = { "--project": "project", "--marketplace": "marketplace", "--artifact": "artifact", "--pending-pr": "pendingPr", "--content-hash": "contentHash", "--rejected": "rejected" };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--clear-pending") options.clearPending = true;
    else if (flags[argument]) options[flags[argument]] = rest[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.project) throw new Error("Missing --project <dir>");
  if (command !== "record" && !options.marketplace) throw new Error("Missing --marketplace <dir>");
  return options;
}

function print(value, json) {
  console.log(json ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const project = path.resolve(options.project);
  const marketplace = options.marketplace ? path.resolve(options.marketplace) : null;
  if (options.command === "init") print(init(project, marketplace), options.json);
  else if (options.command === "status") print(status(project, marketplace), options.json);
  else if (options.command === "record") print(record(project, options.artifact, options), options.json);
  else throw new Error(`Unknown command: ${options.command}. Use init, status or record.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
