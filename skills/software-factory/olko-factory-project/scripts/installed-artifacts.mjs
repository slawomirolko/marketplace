/**
 * The installed-artifact model shared by the project status scan (`project-scan.mjs`) and the
 * marketplace lock (`scripts/olko-marketplace-lock.mjs` in a marketplace checkout): where harnesses
 * keep skills and agents, which files are the project adapter, the portable content and its hashes,
 * the marketplace history of one artifact with its versions, and the state of a copy against it.
 *
 * This file is part of the olko-factory-project skill and imports only Node built-ins, so an
 * installed copy of the skill keeps working on its own. The lock imports it from the checkout.
 */

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** A skill or agent name in a harness folder or a marketplace path. */
export const NAME = /^[a-z0-9][a-z0-9-]*$/;
/** How many marketplace commits per artifact are compared by default. */
export const DEFAULT_DEPTH = 40;
/** The ref of a marketplace checkout without an origin remote: its own HEAD. */
export const LOCAL_REF = "HEAD";
/** The prefix of a content hash (`hashFiles(...).hash`). */
export const HASH_PREFIX = "sha256:";
/** The marketplace index that lists skill versions. */
export const REGISTRY_FILE = "registry.json";
/** The marketplace index that lists OpenCode agent versions. */
export const AGENT_MANIFEST_FILE = "agents/opencode/index.json";

const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const BLOB_MAX_BUFFER = 256 * 1024 * 1024;
const SKILL_FILE = "SKILL.md";
const ADAPTER_FILE = "project.md";
const NAME_SLOT = "{name}";
const ANY_FOLDER = "*";
const PLUGINS_FOLDER = "plugins";

/** Where each harness keeps installed skills and agents, relative to the project root. */
export const LOCATIONS = [
  { kind: "skill", harness: "agents", dir: ".agents/skills" },
  { kind: "skill", harness: "claude-code", dir: ".claude/skills" },
  { kind: "skill", harness: "opencode", dir: ".opencode/skills" },
  { kind: "agent", harness: "opencode", dir: ".opencode/agents" },
  { kind: "agent", harness: "claude-code", dir: ".claude/agents" },
];

/**
 * Where the marketplace keeps each kind, per harness. `{name}` is the artifact name, `*` any one folder.
 * A skill path names its `SKILL.md`; the skill is that folder. `harness: "any"` serves every harness.
 * `sourceLayout` marks the layout of a marketplace source checkout. Plain paths win over plugin paths.
 */
export const SOURCE_PATHS = [
  { kind: "skill", harness: "any", parts: ["skills", ANY_FOLDER, NAME_SLOT, SKILL_FILE], sourceLayout: true },
  { kind: "skill", harness: "any", parts: [PLUGINS_FOLDER, ANY_FOLDER, "skills", NAME_SLOT, SKILL_FILE], sourceLayout: false },
  { kind: "agent", harness: "opencode", parts: ["agents", "opencode", `${NAME_SLOT}.md`], sourceLayout: true },
  { kind: "agent", harness: "claude-code", parts: [PLUGINS_FOLDER, ANY_FOLDER, "agents", `${NAME_SLOT}.md`], sourceLayout: false },
];

const indexCache = new Map();
const treeCache = new Map();

export function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: GIT_MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * True for a file inside an installed skill folder that belongs to the project, not to the marketplace:
 * `project.md` at the skill root and any `*.local.*` file. See docs/skill-adaptation-contract.md.
 */
export function isAdapterFile(relativePath) {
  const name = relativePath.split("/").pop();
  return relativePath === ADAPTER_FILE || /\.local\./.test(name);
}

/** Line endings made the same: CRLF and lone CR become LF. */
export function normalizeText(text) {
  return text.replace(/\r\n?/g, "\n");
}

/** The end of the front matter of normalized text (the index of its closing "\n---"), or -1 without one. */
function frontMatterEnd(body) {
  if (!body.startsWith("---\n")) {
    return -1;
  }
  return body.indexOf("\n---", 4);
}

/** Normalized text without the `model:` lines of its front matter: the model belongs to the project. */
export function stripModelLine(text) {
  const body = normalizeText(text);
  const end = frontMatterEnd(body);
  if (end < 0) {
    return body;
  }
  const front = body.slice(4, end).split("\n").filter((line) => !/^model:/.test(line)).join("\n");
  return `---\n${front}${body.slice(end)}`;
}

/** The text a marketplace copy and a project copy are compared on: normalized, and without the model line for agents. */
export function portableText(kind, text) {
  return kind === "agent" ? stripModelLine(text) : normalizeText(text);
}

/** The `model:` line of the front matter, or null without one. */
export function modelLine(text) {
  const body = normalizeText(text);
  const end = frontMatterEnd(body);
  if (end < 0) {
    return null;
  }
  return body.slice(4, end).split("\n").find((line) => /^model:/.test(line)) ?? null;
}

export function fileHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * The content hash of portable files (Map of relative path to portable text): `sha256:` plus the
 * SHA-256 of `<path>\n<text>\n` for every file in path order, and the SHA-256 of each file.
 */
export function hashFiles(files) {
  const perFile = {};
  const total = crypto.createHash("sha256");
  for (const name of [...files.keys()].sort()) {
    const content = files.get(name);
    perFile[name] = fileHash(content);
    total.update(`${name}\n${content}\n`);
  }
  return { hash: `${HASH_PREFIX}${total.digest("hex")}`, files: perFile };
}

function listValue(raw) {
  const inline = raw.trim().match(/^\[(.*)\]$/);
  if (!inline) {
    return [];
  }
  return inline[1].split(",").map((item) => item.trim().replace(/^["']|["']$/g, "")).filter((item) => NAME.test(item));
}

/** Front matter fields the scan needs: version, uses, and the allowed names under permission.skill / permission.task. */
export function frontMatter(text) {
  const body = normalizeText(text);
  const result = { version: null, uses: [], skills: [], tasks: [] };
  if (!body.startsWith("---\n")) {
    return result;
  }
  const end = body.indexOf("\n---", 4);
  const lines = body.slice(4, end < 0 ? undefined : end).split("\n");
  let block = null;
  let section = null;
  for (const line of lines) {
    const top = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (top) {
      block = top[1];
      section = null;
      if (block === "version") {
        result.version = top[2].replace(/^["']|["']$/g, "") || null;
      }
      if (block === "uses") {
        result.uses = listValue(top[2]);
      }
      continue;
    }
    if (block === "uses") {
      const item = line.match(/^\s+-\s*([a-z0-9-]+)/);
      if (item) {
        result.uses.push(item[1]);
      }
      continue;
    }
    if (block === "metadata") {
      const version = line.match(/^\s+version:\s*["']?([^"'\s]+)/);
      if (version && !result.version) {
        result.version = version[1];
      }
      continue;
    }
    if (block !== "permission") {
      continue;
    }
    const sub = line.match(/^ {2}([a-z]+):\s*$/);
    if (sub) {
      section = sub[1];
      continue;
    }
    const grant = line.match(/^ {4}["']?([a-z0-9][a-z0-9-]*)["']?:\s*["']?(allow|ask)/);
    if (grant && section === "skill") {
      result.skills.push(grant[1]);
    }
    if (grant && section === "task") {
      result.tasks.push(grant[1]);
    }
  }
  return result;
}

function listFiles(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

/** The portable content of a copy on disk: a skill folder or an agent file. */
function readCopy(kind, target) {
  const contents = new Map();
  if (kind === "agent") {
    const text = fs.readFileSync(target, "utf8");
    contents.set(path.basename(target), portableText(kind, text));
    const meta = frontMatter(text);
    const requires = [...meta.skills.map((skillName) => `skill:${skillName}`), ...meta.tasks.map((agentName) => `agent:${agentName}`)];
    return { contents, ...hashesOf(contents), adapter: false, model: modelLine(text), requires };
  }
  let adapter = false;
  for (const relativePath of listFiles(target)) {
    if (isAdapterFile(relativePath)) {
      adapter = true;
      continue;
    }
    contents.set(relativePath, portableText(kind, fs.readFileSync(path.join(target, relativePath), "utf8")));
  }
  const skillFile = path.join(target, SKILL_FILE);
  const meta = fs.existsSync(skillFile) ? frontMatter(fs.readFileSync(skillFile, "utf8")) : frontMatter("");
  return { contents, ...hashesOf(contents), adapter, model: null, requires: meta.uses.map((skillName) => `skill:${skillName}`) };
}

function hashesOf(contents) {
  const { hash, files } = hashFiles(contents);
  return { files, contentHash: hash };
}

/** One copy on disk with its portable content, per-file hashes, content hash, adapter, model and requirements. */
export function copyAt(kind, name, harness, location, target) {
  return { kind, name, harness, location, path: target, ...readCopy(kind, target) };
}

/** The skill in a skill folder entry, or null when the entry is not a named skill folder. */
export function skillEntryOf(dir, entry, harness, location) {
  const skillDir = path.join(dir, entry.name);
  if (!entry.isDirectory() || !NAME.test(entry.name) || !fs.existsSync(path.join(skillDir, SKILL_FILE))) {
    return null;
  }
  return copyAt("skill", entry.name, harness, location, skillDir);
}

/** The agent in an agent folder entry, or null when the entry is not a named Markdown file. */
export function agentEntryOf(dir, entry, harness, location) {
  const name = entry.name.replace(/\.md$/, "");
  if (!entry.isFile() || !entry.name.endsWith(".md") || !NAME.test(name)) {
    return null;
  }
  return copyAt("agent", name, harness, location, path.join(dir, entry.name));
}

/** Every skill and agent copy installed in the project, in LOCATIONS order. */
export function installedArtifacts(project) {
  const artifacts = [];
  for (const location of LOCATIONS) {
    const dir = path.join(project, location.dir);
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const where = `${location.dir}/${entry.name}`;
      const read = location.kind === "skill" ? skillEntryOf : agentEntryOf;
      artifacts.push(read(dir, entry, location.harness, where));
    }
  }
  return artifacts.filter(Boolean);
}

/** The installed copy at a project-relative location, or null when the location is not a LOCATIONS entry for this kind and name. */
export function copyAtLocation(project, kind, name, location) {
  const row = LOCATIONS.find((candidate) => candidate.kind === kind && location === `${candidate.dir}/${kind === "skill" ? name : `${name}.md`}`);
  if (!row || !NAME.test(name)) {
    return null;
  }
  return { row, target: path.join(project, ...location.split("/")) };
}

/** The SOURCE_PATHS rows for a kind and harness: every skill row, or the agent rows of the harness (OpenCode by default). */
export function sourcePathsFor(kind, harness) {
  if (kind === "skill") {
    return SOURCE_PATHS.filter((row) => row.kind === "skill");
  }
  const agentHarness = harness === "claude-code" ? "claude-code" : "opencode";
  return SOURCE_PATHS.filter((row) => row.kind === "agent" && row.harness === agentHarness);
}

/** The artifact name a file path holds in a SOURCE_PATHS row, or null when the path does not fit the row. */
function nameInPath(file, parts) {
  const segments = file.split("/");
  if (segments.length !== parts.length) {
    return null;
  }
  let name = null;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const segment = segments[i];
    if (part === ANY_FOLDER) {
      continue;
    }
    if (part.includes(NAME_SLOT)) {
      const [before, after] = part.split(NAME_SLOT);
      if (!segment.startsWith(before) || !segment.endsWith(after) || segment.length <= before.length + after.length) {
        return null;
      }
      name = segment.slice(before.length, segment.length - after.length);
      continue;
    }
    if (part !== segment) {
      return null;
    }
  }
  return name && NAME.test(name) ? name : null;
}

/** The marketplace path of the artifact a file defines: the skill folder or the agent file. */
function sourceOfFile(kind, file) {
  return kind === "skill" ? path.posix.dirname(file) : file;
}

/** The paths at a ref that hold an artifact: plain marketplace paths first, then plugin paths. */
export function candidatePaths(files, artifact) {
  const rows = sourcePathsFor(artifact.kind, artifact.harness);
  const found = files.filter((file) => rows.some((row) => nameInPath(file, row.parts) === artifact.name)).map((file) => sourceOfFile(artifact.kind, file));
  return found.sort((left, right) => Number(left.startsWith(`${PLUGINS_FOLDER}/`)) - Number(right.startsWith(`${PLUGINS_FOLDER}/`)) || left.localeCompare(right));
}

/** The git pathspecs that find an artifact in the marketplace history. */
export function historyPathspecs(artifact) {
  return sourcePathsFor(artifact.kind, artifact.harness).map((row) => `:(glob)${row.parts.map((part) => part.replace(NAME_SLOT, artifact.name)).join("/")}`);
}

/** The skill or agent a file of a marketplace source checkout defines, or null for any other file. */
export function sourceEntryOf(file) {
  for (const row of SOURCE_PATHS.filter((candidate) => candidate.sourceLayout)) {
    const name = nameInPath(file, row.parts);
    if (name) {
      return { kind: row.kind, name, source: sourceOfFile(row.kind, file) };
    }
  }
  return null;
}

/** Every file path in the marketplace tree at `ref`, or none when the ref does not exist. */
export function treeFiles(marketplace, ref) {
  const key = `${marketplace}\0${ref}`;
  if (!treeCache.has(key)) {
    let listing = "";
    try {
      listing = git(marketplace, "ls-tree", "-r", "-z", "--name-only", "--full-tree", ref);
    } catch {
      listing = "";
    }
    treeCache.set(key, listing.split("\0").filter(Boolean));
  }
  return treeCache.get(key);
}

/** The marketplace path of an artifact (a skill folder or an agent file), at `ref` or in its history. */
export function marketplacePath(marketplace, artifact, ref = LOCAL_REF) {
  const candidates = candidatePaths(treeFiles(marketplace, ref), artifact);
  if (candidates.length) {
    return { path: candidates[0], present: true };
  }
  let last = "";
  try {
    last = git(marketplace, "log", ref, "-n", "1", "--format=%H", "--name-only", "--", ...historyPathspecs(artifact));
  } catch {
    last = "";
  }
  const file = last.split("\n").slice(1).find(Boolean);
  if (!file) {
    return null;
  }
  return { path: sourceOfFile(artifact.kind, file), present: false };
}

/**
 * Reads many objects (blob ids or `<commit>:<path>` names) with one git process.
 * Returns a Map from each name to its text, or null when git does not have it.
 */
export function readObjects(marketplace, names) {
  const unique = [...new Set(names)];
  const objects = new Map();
  if (!unique.length) {
    return objects;
  }
  const result = spawnSync("git", ["-C", marketplace, "cat-file", "--batch"], { input: `${unique.join("\n")}\n`, maxBuffer: BLOB_MAX_BUFFER });
  if (result.status !== 0) {
    throw new Error(`git cat-file failed: ${String(result.stderr)}`);
  }
  const buffer = result.stdout;
  let offset = 0;
  for (const name of unique) {
    const newline = buffer.indexOf(10, offset);
    const header = buffer.subarray(offset, newline).toString("utf8").split(" ");
    const found = header.length === 3 && /^[0-9a-f]{40,64}$/.test(header[0]) && /^\d+$/.test(header[2]);
    if (!found) {
      objects.set(name, null);
      offset = newline + 1;
      continue;
    }
    const length = Number(header[2]);
    objects.set(name, buffer.subarray(newline + 1, newline + 1 + length).toString("utf8"));
    offset = newline + 1 + length + 1;
  }
  return objects;
}

/** The marketplace index that lists the version of a source path, or null when no index covers it. */
function indexFileOf(kind, source) {
  const row = SOURCE_PATHS.find((candidate) => candidate.kind === kind && candidate.sourceLayout);
  const file = kind === "skill" ? `${source}/${SKILL_FILE}` : source;
  if (!nameInPath(file, row.parts)) {
    return null;
  }
  return kind === "skill" ? REGISTRY_FILE : AGENT_MANIFEST_FILE;
}

/** The parsed index file at each commit (null when missing or not JSON), read with one git process and cached. */
function indexesAt(marketplace, commits, indexFile) {
  const keyOf = (commit) => `${marketplace}\0${commit}:${indexFile}`;
  const unread = commits.filter((commit) => !indexCache.has(keyOf(commit)));
  const texts = readObjects(marketplace, unread.map((commit) => `${commit}:${indexFile}`));
  for (const commit of unread) {
    indexCache.set(keyOf(commit), parseJson(texts.get(`${commit}:${indexFile}`)));
  }
  return new Map(commits.map((commit) => [commit, indexCache.get(keyOf(commit))]));
}

function parseJson(text) {
  if (typeof text !== "string") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function versionString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The version an index lists for a source path: `registry.json` `skills[].version` for a skill under
 * `skills/<category>/`, `agents/opencode/index.json` `agents[].version` for an OpenCode agent. Null otherwise.
 */
function indexedVersion(kind, source, index) {
  if (!index) {
    return null;
  }
  if (kind === "skill") {
    const name = path.posix.basename(source);
    const skills = Array.isArray(index.skills) ? index.skills : [];
    const entry = skills.find((skill) => skill?.name === name && (!skill.category || `skills/${skill.category}/${name}` === source));
    return versionString(entry?.version);
  }
  const fileName = path.posix.basename(source);
  const agents = Array.isArray(index.agents) ? index.agents : [];
  const entry = agents.find((agent) => (agent?.file ? agent.file === fileName : `${agent?.name}.md` === fileName));
  return versionString(entry?.version);
}

/**
 * The last `depth` marketplace versions of a source path at `ref`, newest first: commit, date, version,
 * portable contents with their per-file hashes and content hash, and the agent model line.
 * The version is the registry or agent manifest version at that commit, else the front matter `version`.
 * `truncated` is true when the path has older commits than the ones compared.
 */
export function marketplaceVersions(marketplace, kind, source, depth = DEFAULT_DEPTH, ref = LOCAL_REF) {
  const log = git(marketplace, "log", ref, "-n", String(depth + 1), "--format=%H %cs", "--", source);
  const allCommits = log ? log.split("\n").map((line) => ({ commit: line.split(" ")[0], date: line.split(" ")[1] })) : [];
  const truncated = allCommits.length > depth;
  const commits = allCommits.slice(0, depth);
  const trees = commits.map((entry) => {
    const listing = git(marketplace, "ls-tree", "-r", "-z", "--full-tree", entry.commit, "--", source);
    const files = listing.split("\0").filter(Boolean).map((line) => {
      const [meta, file] = line.split("\t");
      const [, type, blob] = meta.split(" ");
      return { type, blob, relativePath: kind === "skill" ? path.posix.relative(source, file) : path.posix.basename(file) };
    }).filter((file) => file.type === "blob");
    return { ...entry, files };
  });
  const blobs = readObjects(marketplace, trees.flatMap((tree) => tree.files.map((file) => file.blob)));
  const indexFile = indexFileOf(kind, source);
  const indexes = indexFile ? indexesAt(marketplace, commits.map((entry) => entry.commit), indexFile) : new Map();
  const versions = trees
    .filter((tree) => tree.files.length > 0)
    .map((tree) => {
      const contents = new Map();
      let frontVersion = null;
      let model = null;
      for (const file of tree.files) {
        if (isAdapterFile(file.relativePath)) {
          continue;
        }
        const text = blobs.get(file.blob) ?? "";
        contents.set(file.relativePath, portableText(kind, text));
        if (file.relativePath === SKILL_FILE || kind === "agent") {
          frontVersion = frontMatter(text).version;
        }
        if (kind === "agent") {
          model = modelLine(text);
        }
      }
      const version = indexedVersion(kind, source, indexes.get(tree.commit)) ?? frontVersion;
      return { commit: tree.commit, date: tree.date, version, contents, ...hashesOf(contents), model };
    });
  return { versions, truncated };
}

export function differingFiles(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((file) => left[file] !== right[file]).sort();
}

/** Lines only one side has, summed over all files. */
function lineDistance(left, right) {
  let distance = 0;
  for (const name of new Set([...left.keys(), ...right.keys()])) {
    const leftLines = (left.get(name) ?? "").split("\n");
    const rightLines = (right.get(name) ?? "").split("\n");
    const leftSet = new Set(leftLines);
    const rightSet = new Set(rightLines);
    distance += leftLines.filter((line) => !rightSet.has(line)).length;
    distance += rightLines.filter((line) => !leftSet.has(line)).length;
  }
  return distance;
}

/** The version nearest to a copy: fewest differing files, then fewest differing lines, then the newest. */
export function nearestVersion(copy, versions) {
  const contents = copy.contents ?? new Map();
  const ranked = versions.map((version, index) => ({
    version,
    index,
    diff: differingFiles(copy.files, version.files),
    lines: version.contents ? lineDistance(contents, version.contents) : 0,
  }));
  ranked.sort((left, right) => left.diff.length - right.diff.length || left.lines - right.lines || left.index - right.index);
  return ranked[0] ?? null;
}

/**
 * The state of one copy against the history of its marketplace source, with the version entries behind it:
 * `head`, `base` (the version the copy is, or is guessed to be, a copy of) and `nearest` with its `diff`.
 */
export function compare(copy, versions, present, { truncated = false } = {}) {
  if (!versions.length) {
    return { state: "local-only", head: null, base: null, nearest: null };
  }
  const head = versions[0];
  if (!present) {
    return { state: "removed", head, base: null, nearest: null };
  }
  const exact = versions.findIndex((version) => differingFiles(copy.files, version.files).length === 0);
  if (exact === 0) {
    const adapted = copy.adapter || (copy.kind === "agent" && copy.model !== head.model);
    return { state: adapted ? "adapted" : "current", head, base: head, nearest: null };
  }
  if (exact > 0) {
    return { state: "outdated", head, base: versions[exact], nearest: null };
  }
  const nearest = nearestVersion(copy, versions);
  if (truncated) {
    return { state: "unknown-base", head, base: null, nearest, baseOlderThanDepth: true };
  }
  const shared = Object.keys(copy.files).some((file) => copy.files[file] === nearest.version.files[file]);
  if (!shared) {
    return { state: "unknown-base", head, base: null, nearest };
  }
  return { state: "modified", head, base: nearest.version, nearest };
}
