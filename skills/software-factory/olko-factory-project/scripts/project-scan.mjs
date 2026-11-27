import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHECKOUT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULT_DEPTH = 40;
/** Files a project may change without leaving the marketplace version: the adapter layer. */
const ADAPTER_FILES = new Set(["project.md"]);

/** Where each harness keeps installed skills and agents, relative to the project root. */
export const LOCATIONS = [
  { kind: "skill", harness: "agents", dir: ".agents/skills" },
  { kind: "skill", harness: "claude-code", dir: ".claude/skills" },
  { kind: "skill", harness: "opencode", dir: ".opencode/skills" },
  { kind: "agent", harness: "opencode", dir: ".opencode/agents" },
  { kind: "agent", harness: "claude-code", dir: ".claude/agents" },
];

/** Files or folders that show a harness is set up in the project. */
export const HARNESS_MARKERS = {
  opencode: [".opencode", "opencode.json", "opencode.jsonc"],
  "claude-code": [".claude", "CLAUDE.md"],
  codex: [".codex"],
  "agents-md": ["AGENTS.md", ".agents"],
};

export const STATES = ["current", "adapted", "outdated", "modified", "unknown-base", "missing", "removed", "local-only"];

function fail(message) {
  console.error(message);
  process.exit(2);
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    const name = arg.slice(2);
    flags[name] = rest[i + 1] !== undefined && !rest[i + 1].startsWith("--") ? rest[(i += 1)] : "true";
  }
  return { command, flags };
}

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function normalize(text) {
  return text.replace(/\r\n?/g, "\n");
}

/** Agent files keep their marketplace text except the model line, which belongs to the project. */
export function portableText(kind, text) {
  const body = normalize(text);
  if (kind !== "agent" || !body.startsWith("---\n")) return body;
  const end = body.indexOf("\n---", 4);
  if (end < 0) return body;
  const front = body.slice(4, end).split("\n").filter((line) => !/^model:/.test(line)).join("\n");
  return `---\n${front}${body.slice(end)}`;
}

function modelLine(text) {
  return normalize(text).match(/^model:.*$/m)?.[0] ?? null;
}

function hash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

/** Front matter fields this script needs: version, uses, and the allowed names under permission.skill / permission.task. */
export function frontMatter(text) {
  const body = normalize(text);
  const result = { version: null, uses: [], skills: [], tasks: [] };
  if (!body.startsWith("---\n")) return result;
  const end = body.indexOf("\n---", 4);
  const lines = body.slice(4, end < 0 ? undefined : end).split("\n");
  let block = null;
  let section = null;
  for (const line of lines) {
    const top = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (top) {
      block = top[1];
      section = null;
      if (block === "version") result.version = top[2].replace(/^["']|["']$/g, "") || null;
      if (block === "uses") result.uses = listValue(top[2]);
      continue;
    }
    if (block === "uses") {
      const item = line.match(/^\s+-\s*([a-z0-9-]+)/);
      if (item) result.uses.push(item[1]);
      continue;
    }
    if (block === "metadata") {
      const version = line.match(/^\s+version:\s*["']?([^"'\s]+)/);
      if (version && !result.version) result.version = version[1];
      continue;
    }
    if (block !== "permission") continue;
    const sub = line.match(/^ {2}([a-z]+):\s*$/);
    if (sub) {
      section = sub[1];
      continue;
    }
    const grant = line.match(/^ {4}["']?([a-z0-9][a-z0-9-]*)["']?:\s*["']?(allow|ask)/);
    if (grant && section === "skill") result.skills.push(grant[1]);
    if (grant && section === "task") result.tasks.push(grant[1]);
  }
  return result;
}

function listValue(raw) {
  const inline = raw.trim().match(/^\[(.*)\]$/);
  if (!inline) return [];
  return inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => NAME.test(s));
}

/** The harnesses set up in the project, with the markers found. */
export function detectHarnesses(project) {
  return Object.entries(HARNESS_MARKERS)
    .map(([id, markers]) => ({ id, markers: markers.filter((m) => fs.existsSync(path.join(project, m))) }))
    .filter((h) => h.markers.length > 0);
}

/** True when the project is a marketplace source checkout: it keeps skills under skills/<category>/ and lists them in registry.json. */
export function isMarketplaceSource(project) {
  return fs.existsSync(path.join(project, "registry.json")) && fs.existsSync(path.join(project, "skills")) && fs.statSync(path.join(project, "skills")).isDirectory();
}

function skillArtifact(skillDir, name, harness, location) {
  const files = {};
  for (const rel of listFiles(skillDir)) if (!ADAPTER_FILES.has(rel)) files[rel] = hash(portableText("skill", fs.readFileSync(path.join(skillDir, rel), "utf8")));
  const meta = frontMatter(fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8"));
  return { kind: "skill", name, harness, location, files, adapter: fs.existsSync(path.join(skillDir, "project.md")), model: null, requires: meta.uses.map((n) => `skill:${n}`) };
}

function agentArtifact(file, name, harness, location) {
  const text = fs.readFileSync(file, "utf8");
  const meta = frontMatter(text);
  return { kind: "agent", name, harness, location, files: { [`${name}.md`]: hash(portableText("agent", text)) }, adapter: false, model: modelLine(text), requires: [...meta.skills.map((n) => `skill:${n}`), ...meta.tasks.map((n) => `agent:${n}`)] };
}

/** The skills under skills/<category>/ and the agents under agents/opencode/ of a marketplace source checkout. */
export function sourceArtifacts(project) {
  if (!isMarketplaceSource(project)) return [];
  const artifacts = [];
  for (const category of fs.readdirSync(path.join(project, "skills"), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const categoryDir = path.join(project, "skills", category.name);
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      const skillDir = path.join(categoryDir, entry.name);
      if (!entry.isDirectory() || !NAME.test(entry.name) || !fs.existsSync(path.join(skillDir, "SKILL.md"))) continue;
      artifacts.push(skillArtifact(skillDir, entry.name, "source", `skills/${category.name}/${entry.name}`));
    }
  }
  const agentsDir = path.join(project, "agents", "opencode");
  if (fs.existsSync(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      const name = entry.name.replace(/\.md$/, "");
      if (!entry.isFile() || !entry.name.endsWith(".md") || !NAME.test(name)) continue;
      artifacts.push(agentArtifact(path.join(agentsDir, entry.name), name, "source", `agents/opencode/${entry.name}`));
    }
  }
  return artifacts.sort((a, b) => a.location.localeCompare(b.location));
}

/** Source skills and agents at `ref` that the project checkout does not have: new on the remote. */
function sourceOnlyOnRemote(marketplace, ref, have) {
  return treeFiles(marketplace, ref)
    .map((f) => (matches(f, ["skills", null, null, "SKILL.md"]) ? { kind: "skill", name: f.split("/")[2], source: path.posix.dirname(f) } : matches(f, ["agents", "opencode", null]) && f.endsWith(".md") ? { kind: "agent", name: f.split("/")[2].replace(/\.md$/, ""), source: f } : null))
    .filter((a) => a && NAME.test(a.name) && !have.has(a.source));
}

/** Every skill and agent copy installed in the project, with the portable file hashes. */
export function installedArtifacts(project) {
  const artifacts = [];
  for (const location of LOCATIONS) {
    const dir = path.join(project, location.dir);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (location.kind === "skill") {
        const skillDir = path.join(dir, entry.name);
        if (!entry.isDirectory() || !fs.existsSync(path.join(skillDir, "SKILL.md")) || !NAME.test(entry.name)) continue;
        artifacts.push(skillArtifact(skillDir, entry.name, location.harness, `${location.dir}/${entry.name}`));
      } else {
        const name = entry.name.replace(/\.md$/, "");
        if (!entry.isFile() || !entry.name.endsWith(".md") || !NAME.test(name)) continue;
        artifacts.push(agentArtifact(path.join(dir, entry.name), name, location.harness, `${location.dir}/${entry.name}`));
      }
    }
  }
  return artifacts;
}

const trees = new Map();

/** Every file path in the marketplace tree at `ref`. */
function treeFiles(marketplace, ref) {
  const key = `${marketplace}\0${ref}`;
  if (!trees.has(key)) {
    let listing = "";
    try {
      listing = git(marketplace, "ls-tree", "-r", "--name-only", "--full-tree", ref);
    } catch {
      listing = "";
    }
    trees.set(key, listing ? listing.split("\n") : []);
  }
  return trees.get(key);
}

/**
 * The marketplace ref the project is compared with: the remote default branch after a fetch, so the status
 * answers "is this the same as the remote". Falls back to HEAD when the checkout has no origin remote.
 */
export function marketplaceRef(marketplace, { fetch = true } = {}) {
  let remotes = [];
  try {
    remotes = git(marketplace, "remote").split("\n").filter(Boolean);
  } catch {
    return { ref: "HEAD", fetched: false, fetchError: null };
  }
  if (!remotes.includes("origin")) return { ref: "HEAD", fetched: false, fetchError: null };
  let fetched = false;
  let fetchError = null;
  if (fetch) {
    try {
      execFileSync("git", ["-C", marketplace, "fetch", "--quiet", "origin"], { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
      fetched = true;
    } catch (error) {
      fetchError = String(error instanceof Error && "stderr" in error ? error.stderr : error).trim().split("\n")[0] || "fetch failed";
    }
  }
  for (const candidate of [() => git(marketplace, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"), () => (git(marketplace, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"), "origin/main")]) {
    try {
      const ref = candidate();
      if (ref) return { ref, fetched, fetchError };
    } catch {
      continue;
    }
  }
  return { ref: "HEAD", fetched, fetchError };
}

/** The marketplace path of an artifact (a skill folder or an agent file), at `ref` or in its history. */
export function marketplacePath(marketplace, artifact, ref = "HEAD") {
  const files = treeFiles(marketplace, ref);
  const candidates = (artifact.kind === "skill"
    ? files.filter((f) => matches(f, ["skills", null, artifact.name, "SKILL.md"]) || matches(f, ["plugins", null, "skills", artifact.name, "SKILL.md"])).map((f) => path.posix.dirname(f))
    : artifact.harness === "claude-code"
      ? files.filter((f) => matches(f, ["plugins", null, "agents", `${artifact.name}.md`]))
      : files.filter((f) => f === `agents/opencode/${artifact.name}.md`)).sort((a, b) => Number(a.startsWith("plugins/")) - Number(b.startsWith("plugins/")) || a.localeCompare(b));
  if (candidates.length) return { path: candidates[0], present: true };
  const pattern = artifact.kind === "skill" ? `:(glob)**/skills/**/${artifact.name}/SKILL.md` : artifact.harness === "claude-code" ? `:(glob)plugins/*/agents/${artifact.name}.md` : `agents/opencode/${artifact.name}.md`;
  let last = "";
  try {
    last = git(marketplace, "log", ref, "-n", "1", "--format=%H", "--name-only", "--", pattern);
  } catch {
    last = "";
  }
  const file = last.split("\n").slice(1).find(Boolean);
  if (!file) return null;
  return { path: artifact.kind === "skill" ? path.posix.dirname(file) : file, present: false };
}

/** True when `file` has exactly these path parts; a null part matches any one folder. */
function matches(file, parts) {
  const segments = file.split("/");
  return segments.length === parts.length && parts.every((p, i) => p === null || p === segments[i]);
}

/** Reads many blobs with one git process. */
function readBlobs(marketplace, ids) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const out = spawnSync("git", ["-C", marketplace, "cat-file", "--batch"], { input: `${unique.join("\n")}\n`, maxBuffer: 256 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`git cat-file failed: ${String(out.stderr)}`);
  const buffer = out.stdout;
  const blobs = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const newline = buffer.indexOf(10, offset);
    const [id, type, size] = buffer.subarray(offset, newline).toString("utf8").split(" ");
    if (type === "missing") {
      offset = newline + 1;
      continue;
    }
    const length = Number(size);
    blobs.set(id, buffer.subarray(newline + 1, newline + 1 + length).toString("utf8"));
    offset = newline + 1 + length + 1;
  }
  return blobs;
}

/** The last `depth` marketplace versions of a path: commit, date, version label and portable file hashes. */
export function marketplaceVersions(marketplace, kind, source, depth = DEFAULT_DEPTH, ref = "HEAD") {
  const log = git(marketplace, "log", ref, "-n", String(depth), "--format=%H %cs", "--", source);
  const commits = log ? log.split("\n").map((line) => ({ commit: line.split(" ")[0], date: line.split(" ")[1] })) : [];
  const trees = commits.map((c) => {
    const listing = git(marketplace, "ls-tree", "-r", "--full-tree", c.commit, "--", source);
    const entries = listing ? listing.split("\n").map((line) => {
      const [meta, file] = line.split("\t");
      return { blob: meta.split(" ")[2], rel: kind === "skill" ? path.posix.relative(source, file) : path.posix.basename(file) };
    }) : [];
    return { ...c, entries };
  });
  const blobs = readBlobs(marketplace, trees.flatMap((t) => t.entries.map((e) => e.blob)));
  return trees
    .filter((t) => t.entries.length > 0)
    .map((t) => {
      const files = {};
      let version = null;
      let model = null;
      for (const e of t.entries) {
        if (ADAPTER_FILES.has(e.rel)) continue;
        const text = blobs.get(e.blob) ?? "";
        files[e.rel] = hash(portableText(kind, text));
        if (e.rel === "SKILL.md" || kind === "agent") version = frontMatter(text).version;
        if (kind === "agent") model = modelLine(text);
      }
      return { commit: t.commit, date: t.date, version: version ?? t.commit.slice(0, 7), files, model };
    });
}

function differingFiles(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((f) => a[f] !== b[f]).sort();
}

/** Compares one installed copy with the marketplace history of its source. */
export function classify(artifact, versions, present) {
  if (!versions.length) return { state: "local-only", installed: null, current: null, files: [] };
  const head = versions[0];
  if (!present) return { state: "removed", installed: null, current: null, lastVersion: head.version, files: [] };
  const exact = versions.findIndex((v) => differingFiles(artifact.files, v.files).length === 0);
  if (exact === 0) {
    const adapted = artifact.adapter || (artifact.kind === "agent" && artifact.model !== head.model);
    return { state: adapted ? "adapted" : "current", installed: head.version, current: head.version, files: [] };
  }
  if (exact > 0) return { state: "outdated", installed: versions[exact].version, current: head.version, base: versions[exact].commit, files: differingFiles(artifact.files, head.files) };
  const ranked = versions.map((v) => ({ v, diff: differingFiles(artifact.files, v.files) })).sort((a, b) => a.diff.length - b.diff.length);
  const nearest = ranked[0];
  const shared = Object.keys(artifact.files).some((f) => artifact.files[f] === nearest.v.files[f]);
  if (!shared) return { state: "unknown-base", installed: null, current: head.version, nearestVersion: nearest.v.version, files: nearest.diff };
  return { state: "modified", installed: nearest.v.version, current: head.version, base: nearest.v.commit, upstreamMoved: nearest.v.commit !== head.commit, files: nearest.diff };
}

/** Factory workflows that run an artifact: as a node agent or skill, or as a named source. */
export function workflowIndex(workflowsDir) {
  const index = new Map();
  if (!workflowsDir || !fs.existsSync(workflowsDir)) return index;
  for (const file of fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yaml")).sort()) {
    const text = fs.readFileSync(path.join(workflowsDir, file), "utf8");
    const name = file.replace(/\.yaml$/, "");
    const names = new Set();
    for (const m of text.matchAll(/^\s*-?\s*(?:agent|skill):\s*["']?([a-z0-9][a-z0-9-]*)/gm)) names.add(m[1]);
    for (const m of text.matchAll(/agents\/opencode\/([a-z0-9][a-z0-9-]*)\.md/g)) names.add(m[1]);
    for (const m of text.matchAll(/skills\/[a-z0-9-]+\/([a-z0-9][a-z0-9-]*)/g)) names.add(m[1]);
    for (const n of names) index.set(n, [...(index.get(n) ?? []), name]);
  }
  return index;
}

function headOf(marketplace, ref) {
  try {
    return git(marketplace, "rev-parse", ref);
  } catch {
    return null;
  }
}

/** The full status of one project, compared with the marketplace remote. */
export function projectStatus({ project, marketplace, factory, depth = DEFAULT_DEPTH, fetch = true }) {
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new Error(`project ${project} is not a folder`);
  const { ref, fetched, fetchError } = marketplaceRef(marketplace, { fetch });
  const workflows = workflowIndex(path.join(factory, "workflows"));
  const sources = sourceArtifacts(project);
  const installed = [...sources, ...installedArtifacts(project)];
  const artifacts = installed.map((artifact) => {
    const source = marketplacePath(marketplace, artifact, ref);
    const versions = source ? marketplaceVersions(marketplace, artifact.kind, source.path, depth, ref) : [];
    const result = classify(artifact, versions, source?.present ?? false);
    return { id: `${artifact.kind}:${artifact.name}`, kind: artifact.kind, name: artifact.name, harness: artifact.harness, location: artifact.location, source: source?.path ?? null, ...result, workflows: workflows.get(artifact.name) ?? [] };
  });
  const have = new Set(installed.map((a) => `${a.kind}:${a.name}`));
  const required = new Map();
  for (const a of installed) for (const id of a.requires) if (!have.has(id)) required.set(id, [...(required.get(id) ?? []), `${a.kind}:${a.name}`]);
  for (const [id, requiredBy] of [...required].sort(([a], [b]) => a.localeCompare(b))) {
    const [kind, name] = id.split(":");
    const source = marketplacePath(marketplace, { kind, name, harness: "opencode" }, ref);
    if (!source?.present) continue;
    artifacts.push({ id, kind, name, harness: null, location: null, source: source.path, state: "missing", installed: null, current: null, files: [], requiredBy: [...new Set(requiredBy)], workflows: workflows.get(name) ?? [] });
  }
  if (sources.length) {
    const ids = new Set(artifacts.map((a) => `${a.harness}:${a.id}`));
    for (const remote of sourceOnlyOnRemote(marketplace, ref, new Set(sources.map((s) => s.location)))) {
      const id = `${remote.kind}:${remote.name}`;
      if (ids.has(`source:${id}`)) continue;
      artifacts.push({ id, kind: remote.kind, name: remote.name, harness: "source", location: null, source: remote.source, state: "missing", installed: null, current: null, files: [], workflows: workflows.get(remote.name) ?? [] });
    }
  }
  artifacts.sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || a.id.localeCompare(b.id));
  const counts = Object.fromEntries(STATES.map((s) => [s, artifacts.filter((a) => a.state === s).length]));
  const runnable = [...new Set(artifacts.filter((a) => a.state !== "missing").flatMap((a) => a.workflows))].sort();
  const marketplaceSource = isMarketplaceSource(project);
  const summary = STATES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(", ") || "no marketplace artifacts installed";
  return { project, marketplace, ref, fetched, fetchError, head: headOf(marketplace, ref), harnesses: detectHarnesses(project), marketplaceSource, artifacts, counts, workflows: runnable, summary };
}

export function defaultOutDir() {
  return path.join(process.env.FACTORY_HOME_DIR ?? path.join(os.homedir(), ".skill-factory"), "project-status");
}

/** Writes the full status as a JSON file and returns the short result the factory keeps in run state. */
export function writeStatus(status, { outDir = defaultOutDir(), id }) {
  fs.mkdirSync(outDir, { recursive: true });
  const label = NAME.test(id ?? "") ? id : "project";
  const file = path.join(outDir, `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ ...status, createdAt: new Date().toISOString() }, null, 2)}\n`);
  return { file, ref: status.ref, fetched: status.fetched, head: status.head, counts: status.counts, harnesses: status.harnesses.map((h) => h.id), marketplaceSource: status.marketplaceSource, workflows: status.workflows, summary: status.summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { command, flags } = parseArgs(process.argv.slice(2));
    if (command !== "status") fail(`unknown command ${command ?? ""}; use: status --project <folder> [--id <name>] [--marketplace <checkout>] [--factory <folder>] [--out-dir <folder>] [--depth <n>] [--no-fetch] [--print]`);
    if (!flags.project || flags.project === "true") fail("--project <folder> is required");
    const marketplace = path.resolve(flags.marketplace ?? process.env.FACTORY_MARKETPLACE_DIR ?? CHECKOUT);
    const status = projectStatus({ project: path.resolve(flags.project), marketplace, factory: path.resolve(flags.factory ?? process.env.FACTORY_DIR ?? path.join(marketplace, "factory")), depth: Number(flags.depth ?? DEFAULT_DEPTH), fetch: flags["no-fetch"] !== "true" });
    const result = flags.print === "true" ? status : writeStatus(status, { ...(flags["out-dir"] ? { outDir: path.resolve(flags["out-dir"]) } : {}), id: flags.id });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
