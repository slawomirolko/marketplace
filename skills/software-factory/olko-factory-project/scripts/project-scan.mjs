import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DEPTH,
  LOCAL_REF,
  NAME,
  agentEntryOf,
  compare,
  differingFiles,
  git,
  installedArtifacts,
  marketplacePath,
  marketplaceVersions,
  skillEntryOf,
  sourceEntryOf,
  treeFiles,
} from "./installed-artifacts.mjs";

export {
  LOCATIONS,
  SOURCE_PATHS,
  frontMatter,
  hashFiles,
  installedArtifacts,
  isAdapterFile,
  marketplacePath,
  marketplaceVersions,
  normalizeText as normalize,
  portableText,
} from "./installed-artifacts.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHECKOUT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");
/** The harness of the skills and agents of a marketplace source checkout. */
const SOURCE_HARNESS = "source";
const FETCH_TIMEOUT_MS = 120000;

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

/** The harnesses set up in the project, with the markers found. */
export function detectHarnesses(project) {
  return Object.entries(HARNESS_MARKERS)
    .map(([id, markers]) => ({ id, markers: markers.filter((m) => fs.existsSync(path.join(project, m))) }))
    .filter((h) => h.markers.length > 0);
}

/** True when the project is a marketplace source checkout: it keeps skills under skills/<category>/ and lists them in registry.json. */
function isMarketplaceSource(project) {
  return fs.existsSync(path.join(project, "registry.json")) && fs.existsSync(path.join(project, "skills")) && fs.statSync(path.join(project, "skills")).isDirectory();
}

/** The skills under skills/<category>/ and the agents under agents/opencode/ of a marketplace source checkout. */
function sourceArtifacts(project) {
  if (!isMarketplaceSource(project)) {
    return [];
  }
  const artifacts = [];
  for (const category of fs.readdirSync(path.join(project, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const categoryDir = path.join(project, "skills", category.name);
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      artifacts.push(skillEntryOf(categoryDir, entry, SOURCE_HARNESS, `skills/${category.name}/${entry.name}`));
    }
  }
  const agentsDir = path.join(project, "agents", "opencode");
  if (fs.existsSync(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      artifacts.push(agentEntryOf(agentsDir, entry, SOURCE_HARNESS, `agents/opencode/${entry.name}`));
    }
  }
  return artifacts.filter(Boolean).sort((a, b) => a.location.localeCompare(b.location));
}

/** Source skills and agents at `ref` that the project checkout does not have: new on the remote. */
function sourceOnlyOnRemote(marketplace, ref, have) {
  return treeFiles(marketplace, ref)
    .map(sourceEntryOf)
    .filter((entry) => entry && !have.has(entry.source));
}

/** Fetches origin; returns the first line of the error when the fetch fails, else null. */
function fetchOrigin(marketplace) {
  try {
    execFileSync("git", ["-C", marketplace, "fetch", "--quiet", "origin"], { stdio: ["ignore", "pipe", "pipe"], timeout: FETCH_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return null;
  } catch (error) {
    return String(error instanceof Error && "stderr" in error ? error.stderr : error).trim().split("\n")[0] || "fetch failed";
  }
}

/** The default branch of origin: its symbolic HEAD, else origin/main, else null. */
function originDefaultRef(marketplace) {
  const candidates = [() => git(marketplace, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"), () => (git(marketplace, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"), "origin/main")];
  for (const candidate of candidates) {
    try {
      const ref = candidate();
      if (ref) {
        return ref;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The marketplace ref the project is compared with: the remote default branch after a fetch, so the status
 * answers "is this the same as the remote". Falls back to HEAD when the checkout has no origin remote.
 */
function marketplaceRef(marketplace, { fetch = true } = {}) {
  let remotes = [];
  try {
    remotes = git(marketplace, "remote").split("\n").filter(Boolean);
  } catch {
    return { ref: LOCAL_REF, fetched: false, fetchError: null };
  }
  if (!remotes.includes("origin")) {
    return { ref: LOCAL_REF, fetched: false, fetchError: null };
  }
  const fetchError = fetch ? fetchOrigin(marketplace) : null;
  return { ref: originDefaultRef(marketplace) ?? LOCAL_REF, fetched: fetch && fetchError === null, fetchError };
}

const short = (version) => version.commit.slice(0, 7);

/**
 * Compares one installed copy with the marketplace history of its source. Versions come from the registry
 * or the agent manifest, else front matter; commits only tell versions apart. `base` is the full commit the
 * copy is (or, for `modified`, is guessed to be) a copy of. When the compared history is `truncated` and no
 * version matches exactly, the base may be older than the history: it is reported as such.
 */
export function classify(artifact, versions, present, { truncated = false } = {}) {
  const result = compare(artifact, versions, present, { truncated });
  const { head, base, nearest } = result;
  if (result.state === "local-only") {
    return { state: "local-only", installed: null, current: null, files: [] };
  }
  if (result.state === "removed") {
    return { state: "removed", installed: null, current: null, lastVersion: head.version, lastCommit: short(head), files: [] };
  }
  const atHead = { current: head.version, currentCommit: short(head) };
  if (result.state === "current" || result.state === "adapted") {
    return { state: result.state, installed: head.version, installedCommit: short(head), ...atHead, base: head.commit, files: [] };
  }
  if (result.state === "outdated") {
    return { state: "outdated", installed: base.version, installedCommit: short(base), ...atHead, base: base.commit, files: differingFiles(artifact.files, head.files) };
  }
  if (result.state === "unknown-base") {
    const unknownBase = { state: "unknown-base", installed: null, ...atHead, nearestVersion: nearest.version.version, nearestCommit: short(nearest.version), files: nearest.diff };
    return result.baseOlderThanDepth ? { ...unknownBase, baseOlderThanDepth: true } : unknownBase;
  }
  return { state: "modified", installed: base.version, installedCommit: short(base), ...atHead, base: base.commit, upstreamMoved: base.commit !== head.commit, files: nearest.diff };
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
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error("--depth must be a positive integer");
  }
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    throw new Error(`project ${project} is not a folder`);
  }
  const { ref, fetched, fetchError } = marketplaceRef(marketplace, { fetch });
  const workflows = workflowIndex(path.join(factory, "workflows"));
  const sources = sourceArtifacts(project);
  const installed = [...sources, ...installedArtifacts(project)];
  const artifacts = installed.map((artifact) => {
    const source = marketplacePath(marketplace, artifact, ref);
    const { versions, truncated } = source ? marketplaceVersions(marketplace, artifact.kind, source.path, depth, ref) : { versions: [], truncated: false };
    const result = classify(artifact, versions, source?.present ?? false, { truncated });
    return { id: `${artifact.kind}:${artifact.name}`, kind: artifact.kind, name: artifact.name, harness: artifact.harness, location: artifact.location, source: source?.path ?? null, contentHash: artifact.contentHash, ...result, workflows: workflows.get(artifact.name) ?? [] };
  });
  const have = new Set(installed.map((a) => `${a.kind}:${a.name}`));
  const required = new Map();
  for (const artifact of installed) {
    for (const id of artifact.requires.filter((requiredId) => !have.has(requiredId))) {
      required.set(id, [...(required.get(id) ?? []), `${artifact.kind}:${artifact.name}`]);
    }
  }
  for (const [id, requiredBy] of [...required].sort(([a], [b]) => a.localeCompare(b))) {
    const [kind, name] = id.split(":");
    const source = marketplacePath(marketplace, { kind, name, harness: null }, ref);
    if (!source?.present) {
      continue;
    }
    artifacts.push({ id, kind, name, harness: null, location: null, source: source.path, state: "missing", installed: null, current: null, files: [], requiredBy: [...new Set(requiredBy)], workflows: workflows.get(name) ?? [] });
  }
  if (sources.length) {
    const ids = new Set(artifacts.map((a) => `${a.harness}:${a.id}`));
    for (const remote of sourceOnlyOnRemote(marketplace, ref, new Set(sources.map((s) => s.location)))) {
      const id = `${remote.kind}:${remote.name}`;
      if (ids.has(`${SOURCE_HARNESS}:${id}`)) {
        continue;
      }
      artifacts.push({ id, kind: remote.kind, name: remote.name, harness: SOURCE_HARNESS, location: null, source: remote.source, state: "missing", installed: null, current: null, files: [], workflows: workflows.get(remote.name) ?? [] });
    }
  }
  artifacts.sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || a.id.localeCompare(b.id));
  const counts = Object.fromEntries(STATES.map((s) => [s, artifacts.filter((a) => a.state === s).length]));
  const runnable = [...new Set(artifacts.filter((a) => a.state !== "missing").flatMap((a) => a.workflows))].sort();
  const marketplaceSource = isMarketplaceSource(project);
  const summary = STATES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(", ") || "no marketplace artifacts installed";
  return { project, marketplace, ref, fetched, fetchError, head: headOf(marketplace, ref), harnesses: detectHarnesses(project), marketplaceSource, artifacts, counts, workflows: runnable, summary };
}

/** The `--depth` flag as a positive integer; DEFAULT_DEPTH when it is not given. */
export function depthOf(value) {
  if (value === undefined) {
    return DEFAULT_DEPTH;
  }
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("--depth must be a positive integer");
  }
  return Number(value);
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
    const status = projectStatus({ project: path.resolve(flags.project), marketplace, factory: path.resolve(flags.factory ?? process.env.FACTORY_DIR ?? path.join(marketplace, "factory")), depth: depthOf(flags.depth), fetch: flags["no-fetch"] !== "true" });
    const result = flags.print === "true" ? status : writeStatus(status, { ...(flags["out-dir"] ? { outDir: path.resolve(flags["out-dir"]) } : {}), id: flags.id });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
