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
/** The marketplace checkout this script sits in when it runs from `skills/<category>/<skill>/scripts/`. */
const ENCLOSING_CHECKOUT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");
/** The harness of the skills and agents of a marketplace source checkout. */
const SOURCE_HARNESS = "source";
const FETCH_TIMEOUT_MS = 120000;
const ERROR_EXIT = 2;
const USAGE = "use: status --project <folder> [--id <name>] [--marketplace <checkout>] [--factory <folder>] [--out-dir <folder>] [--depth <n>] [--no-fetch] [--print]";
/** The value of a flag given without a value. */
const FLAG_SET = "true";

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
  process.exit(ERROR_EXIT);
}

/** The command and its `--name value` flags; a flag without a value is "true". */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const argument = rest[i];
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument ${argument}`);
    }
    const name = argument.slice(2);
    flags[name] = rest[i + 1] !== undefined && !rest[i + 1].startsWith("--") ? rest[(i += 1)] : FLAG_SET;
  }
  return { command, flags };
}

/**
 * The marketplace checkout to compare with: `--marketplace`, else `FACTORY_MARKETPLACE_DIR`, else the
 * checkout this script sits in. An installed copy of the skill is not inside a checkout (no
 * registry.json there), so it needs the flag or the variable.
 */
export function resolveMarketplace(flag, env = process.env, enclosing = ENCLOSING_CHECKOUT) {
  const given = flag ?? env.FACTORY_MARKETPLACE_DIR;
  if (given) {
    return path.resolve(given);
  }
  if (fs.existsSync(path.join(enclosing, "registry.json"))) {
    return enclosing;
  }
  throw new Error("this script is not inside a marketplace checkout; pass --marketplace <checkout> or set FACTORY_MARKETPLACE_DIR");
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
  if (!workflowsDir || !fs.existsSync(workflowsDir)) {
    return index;
  }
  const patterns = [/^\s*-?\s*(?:agent|skill):\s*["']?([a-z0-9][a-z0-9-]*)/gm, /agents\/opencode\/([a-z0-9][a-z0-9-]*)\.md/g, /skills\/[a-z0-9-]+\/([a-z0-9][a-z0-9-]*)/g];
  for (const file of fs.readdirSync(workflowsDir).filter((entry) => entry.endsWith(".yaml")).sort()) {
    const text = fs.readFileSync(path.join(workflowsDir, file), "utf8");
    const workflow = file.replace(/\.yaml$/, "");
    const names = new Set(patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1])));
    for (const name of names) {
      index.set(name, [...(index.get(name) ?? []), workflow]);
    }
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

/** A `missing` artifact: not installed, but required by an installed copy or new on the remote. */
function missingArtifact({ id, kind, name, harness, source, requiredBy, workflows }) {
  const artifact = { id, kind, name, harness, location: null, source, state: "missing", installed: null, current: null, files: [] };
  if (requiredBy) {
    artifact.requiredBy = requiredBy;
  }
  artifact.workflows = workflows;
  return artifact;
}

/** Every installed copy compared with the marketplace history of its source. */
function classifyInstalled(installed, { marketplace, ref, depth, workflows }) {
  return installed.map((artifact) => {
    const source = marketplacePath(marketplace, artifact, ref);
    const { versions, truncated } = source ? marketplaceVersions(marketplace, artifact.kind, source.path, depth, ref) : { versions: [], truncated: false };
    const result = classify(artifact, versions, source?.present ?? false, { truncated });
    return { id: `${artifact.kind}:${artifact.name}`, kind: artifact.kind, name: artifact.name, harness: artifact.harness, location: artifact.location, source: source?.path ?? null, contentHash: artifact.contentHash, ...result, workflows: workflows.get(artifact.name) ?? [] };
  });
}

/** Artifacts an installed copy requires that are not installed but exist at `ref`, in id order. */
function missingRequired(installed, { marketplace, ref, workflows }) {
  const have = new Set(installed.map((artifact) => `${artifact.kind}:${artifact.name}`));
  const required = new Map();
  for (const artifact of installed) {
    for (const id of artifact.requires.filter((requiredId) => !have.has(requiredId))) {
      required.set(id, [...(required.get(id) ?? []), `${artifact.kind}:${artifact.name}`]);
    }
  }
  const missing = [];
  for (const [id, requiredBy] of [...required].sort(([left], [right]) => left.localeCompare(right))) {
    const [kind, name] = id.split(":");
    const source = marketplacePath(marketplace, { kind, name, harness: null }, ref);
    if (source?.present) {
      missing.push(missingArtifact({ id, kind, name, harness: null, source: source.path, requiredBy: [...new Set(requiredBy)], workflows: workflows.get(name) ?? [] }));
    }
  }
  return missing;
}

/** Source skills and agents at `ref` that a marketplace source checkout does not have and that are not listed yet. */
function missingOnRemote(sources, listed, { marketplace, ref, workflows }) {
  if (!sources.length) {
    return [];
  }
  const ids = new Set(listed.map((artifact) => `${artifact.harness}:${artifact.id}`));
  const missing = [];
  for (const remote of sourceOnlyOnRemote(marketplace, ref, new Set(sources.map((source) => source.location)))) {
    const id = `${remote.kind}:${remote.name}`;
    if (!ids.has(`${SOURCE_HARNESS}:${id}`)) {
      missing.push(missingArtifact({ id, kind: remote.kind, name: remote.name, harness: SOURCE_HARNESS, source: remote.source, workflows: workflows.get(remote.name) ?? [] }));
    }
  }
  return missing;
}

/** A factory workflow file of a marketplace source checkout. */
const WORKFLOW_FILE = /^factory\/workflows\/([a-z0-9][a-z0-9-]*)\.yaml$/;

/** The trimmed output of git, or null when it fails. */
function gitOrNull(cwd, ...args) {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
}

/**
 * How a marketplace source checkout stands against its remote: the remote branch its current branch tracks (else the
 * origin default branch), the commits it is behind and ahead, and the factory workflows changed in the checkout since
 * their merge base (committed, uncommitted or new). Null for a checkout without such a remote branch.
 */
export function checkoutSync(project) {
  const tracked = gitOrNull(project, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
  const upstreamRef = tracked ?? originDefaultRef(project);
  const base = upstreamRef ? gitOrNull(project, "merge-base", "HEAD", upstreamRef) : null;
  if (!upstreamRef || !base) {
    return null;
  }
  const count = (range) => Number(git(project, "rev-list", "--count", range));
  const changed = [...git(project, "diff", "--name-only", base, "--", "factory/workflows").split("\n"), ...git(project, "ls-files", "--others", "--exclude-standard", "--", "factory/workflows").split("\n")];
  const localWorkflows = [...new Set(changed.map((file) => file.match(WORKFLOW_FILE)?.[1]).filter(Boolean))].sort();
  return { upstreamRef, behind: count(`HEAD..${upstreamRef}`), ahead: count(`${upstreamRef}..HEAD`), localWorkflows };
}

/** The count per state, the workflows that run an installed artifact, and a one-line summary. */
function summarize(artifacts) {
  const counts = Object.fromEntries(STATES.map((state) => [state, artifacts.filter((artifact) => artifact.state === state).length]));
  const workflows = [...new Set(artifacts.filter((artifact) => artifact.state !== "missing").flatMap((artifact) => artifact.workflows))].sort();
  const summary = STATES.filter((state) => counts[state]).map((state) => `${counts[state]} ${state}`).join(", ") || "no marketplace artifacts installed";
  return { counts, workflows, summary };
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
  const context = { marketplace, ref, depth, workflows: workflowIndex(path.join(factory, "workflows")) };
  const sources = sourceArtifacts(project);
  const installed = [...sources, ...installedArtifacts(project)];
  const artifacts = [...classifyInstalled(installed, context), ...missingRequired(installed, context)];
  artifacts.push(...missingOnRemote(sources, artifacts, context));
  artifacts.sort((left, right) => STATES.indexOf(left.state) - STATES.indexOf(right.state) || left.id.localeCompare(right.id));
  const { counts, workflows, summary } = summarize(artifacts);
  const marketplaceSource = isMarketplaceSource(project);
  const sync = marketplaceSource ? checkoutSync(project) : null;
  return { project, marketplace, ref, fetched, fetchError, head: headOf(marketplace, ref), harnesses: detectHarnesses(project), marketplaceSource, ...(sync ?? {}), artifacts, counts, workflows, summary };
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

/** The default folder of status files: `project-status` in the factory home. */
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

function main(argv) {
  const { command, flags } = parseArgs(argv);
  if (command !== "status") {
    fail(`unknown command ${command ?? ""}; ${USAGE}`);
  }
  if (!flags.project || flags.project === FLAG_SET) {
    fail("--project <folder> is required");
  }
  const marketplace = resolveMarketplace(flags.marketplace);
  const factory = path.resolve(flags.factory ?? process.env.FACTORY_DIR ?? path.join(marketplace, "factory"));
  const status = projectStatus({ project: path.resolve(flags.project), marketplace, factory, depth: depthOf(flags.depth), fetch: flags["no-fetch"] !== FLAG_SET });
  const result = flags.print === FLAG_SET ? status : writeStatus(status, { ...(flags["out-dir"] ? { outDir: path.resolve(flags["out-dir"]) } : {}), id: flags.id });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
