/**
 * The marketplace source checkout part of `scripts/olko-marketplace-merge.mjs`: the rows of a project that is a
 * marketplace source checkout (it keeps skills under skills/<category>/ and lists them in registry.json).
 *
 * - The pull row (`pull`): the checkout is behind the remote branch its current branch tracks. Applying it
 *   fast-forwards the checkout to exactly the remote commit prepare showed (`git merge --ff-only <commit>`), never a
 *   forced or merge-commit pull. A checkout with uncommitted changes, with untracked files the pull would overwrite,
 *   with commits that are not on the remote or that moved after prepare is refused; a pull git still fails is reported
 *   as that row's result. Only the temporary worktree of a publish row is removed; other worktrees are never pruned.
 * - One publish row per `modified`, `local-only` or `unknown-base` source skill or agent and per changed factory
 *   workflow with its own workflow lock entry (`publish:<kind>:<name>`); a version conflict or an unknown base starts
 *   it unchecked. Applying one puts exactly that artifact's changed files (adapter files excluded) on the remote default branch in a temporary
 *   git worktree, stages them, runs the sanitize gate on the staged commit and on the PR title, body and commit
 *   message, and only when it passes commits, pushes the new branch `feature/upstream-<kind>-<name>-<hash8>` and
 *   opens a draft PR with gh (no shell). It never pushes the default branch, never merges, never marks a PR ready
 *   and adds no reviewers. The person's branch and working tree stay as they were. A row is refused when its files
 *   changed after prepare, or when the remote changed the artifact after the checkout's commit (publishing would
 *   replace newer remote text).
 *
 * The sanitize gate runs with `configOnly`: the checkout's own folder, repository and remote names are the
 * marketplace's own, so only the configured leak terms (fail closed without them) and the secret patterns apply.
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NAME, isAdapterFile, marketplaceVersions, normalizeText, workingTreeVersion } from "../skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs";
import { GateError, scan } from "./olko-sanitize.mjs";
import { resolveGh } from "./olko-upstream-plan.mjs";

export const PULL = "pull";
export const PUBLISH = "publish";
const SOURCE_HARNESS = "source";
const PUBLISHED_STATES = ["modified", "local-only", "unknown-base"];
const PUBLISHED_KINDS = ["skill", "agent", "workflow"];
const WORKFLOWS_LOCK = "factory/workflows.lock.json";
const REMOTE = "origin";
const BRANCH_PREFIX = "feature/upstream";
const BRANCH_HASH = 8;
const SHOWN_COMMITS = 20;
const DIFF_CONTEXT = 1;
const DIFF_LINES = 40;
const ERROR_TAIL = 300;
const COMMIT = /^[0-9a-f]{40,64}$/;
const SOURCE_LOCATION = /^(?:skills\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*|agents\/opencode\/[a-z0-9][a-z0-9-]*\.md|factory\/workflows\/[a-z0-9][a-z0-9-]*\.yaml)$/;
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
/** A safe git ref name: no leading dash or slash, no "..", "//", "@{", control characters, spaces or "~^:?*[\\", no trailing "/", "." or ".lock". */
const REF_NAME = /^(?![-/])(?!.*\.\.)(?!.*\/\/)(?!.*@\{)[A-Za-z0-9._/-]+(?<![/.])(?<!\.lock)$/;

/** True for a plan item of a marketplace source checkout. */
export function isSourceItem(item) {
  return item?.action === PULL || item?.action === PUBLISH;
}

/** Runs git in `cwd`; returns the result without throwing. */
function runGit(cwd, args) {
  return spawnSync("git", ["-C", cwd, "-c", "core.quotepath=false", ...args], { encoding: "utf8", maxBuffer: GIT_MAX_BUFFER });
}

/** The output of git in `cwd` as it is; throws with git's error when it fails. */
function gitRaw(cwd, ...args) {
  const result = runGit(cwd, args);
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${String(result.stderr).trim().slice(-ERROR_TAIL)}`);
  }
  return result.stdout;
}

/** The trimmed output of git in `cwd`; throws with git's error when it fails. */
function gitOut(cwd, ...args) {
  return gitRaw(cwd, ...args).trim();
}

/** The trimmed output of git in `cwd`, or null when it fails. */
function gitTry(cwd, ...args) {
  const result = runGit(cwd, args);
  return result.status === 0 ? result.stdout.trim() : null;
}

/** The NUL-separated names git prints for a `-z` command. */
function gitNames(cwd, ...args) {
  return gitRaw(cwd, ...args).split("\0").filter(Boolean);
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The diff lines from `from` to `to` (texts), without the file header and at most DIFF_LINES of them; used for the
 * resolution of a merged file and for the change of a source file.
 */
export function diffLines(from, to) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-merge-diff-"));
  try {
    fs.writeFileSync(path.join(tempDir, "before"), from);
    fs.writeFileSync(path.join(tempDir, "after"), to);
    const result = spawnSync("git", ["diff", "--no-index", "--no-color", `-U${DIFF_CONTEXT}`, "before", "after"], { cwd: tempDir, encoding: "utf8" });
    const lines = result.stdout.split("\n");
    const body = lines.slice(Math.max(0, lines.findIndex((line) => line.startsWith("@@")))).filter((line) => line !== "");
    const shown = body.slice(0, DIFF_LINES);
    return body.length > DIFF_LINES ? [...shown, `... ${body.length - DIFF_LINES} more lines`] : shown;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** The tracked files of the checkout with uncommitted changes (untracked files do not stop a fast-forward of their own). */
function uncommittedFiles(project) {
  return gitNames(project, "status", "--porcelain=v1", "-z", "--untracked-files=no").filter((entry) => /^.. /.test(entry)).map((entry) => entry.slice(3));
}

/** The number of commits reachable from `to` and not from `from`. */
function countBetween(project, from, to) {
  return Number(gitOut(project, "rev-list", "--count", `${from}..${to}`));
}

/** The remote default branch of the checkout: `origin/HEAD`, else `origin/main`; null without one. */
function defaultRemote(project) {
  const ref = gitTry(project, "symbolic-ref", "--quiet", "--short", `refs/remotes/${REMOTE}/HEAD`) ?? (gitTry(project, "rev-parse", "--verify", "--quiet", `refs/remotes/${REMOTE}/main`) ? `${REMOTE}/main` : null);
  if (!ref) {
    return null;
  }
  return { remoteRef: ref, baseBranch: ref.slice(REMOTE.length + 1), remoteCommit: gitOut(project, "rev-parse", ref) };
}

/** Fetches the checkout's origin so the rows compare with the remote now; a failed fetch keeps what the last fetch left. */
export function fetchCheckout(project) {
  spawnSync("git", ["-C", project, "fetch", "--quiet", REMOTE], { stdio: "ignore", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

/**
 * The pull row, or null when the checkout is not on a branch or is not behind the remote branch it tracks (else the
 * origin default branch), whatever files the commits touch.
 */
function pullItem(project, remote) {
  const branch = gitTry(project, "symbolic-ref", "--quiet", "--short", "HEAD");
  const remoteRef = branch ? (gitTry(project, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}") ?? remote?.remoteRef ?? null) : null;
  if (!remoteRef) {
    return null;
  }
  const remoteCommit = gitOut(project, "rev-parse", remoteRef);
  const head = gitOut(project, "rev-parse", "HEAD");
  const behind = countBetween(project, head, remoteCommit);
  if (behind === 0) {
    return null;
  }
  const commits = gitOut(project, "log", "--format=%h %s", "-n", String(SHOWN_COMMITS), `${head}..${remoteCommit}`).split("\n").filter(Boolean);
  return { id: PULL, action: PULL, branch, remoteRef, remoteCommit, head, behind, commits };
}

/** The path of `name` inside the artifact at `location`; an agent or workflow file is its own name, the workflow lock too. */
function relativeTo(location, name) {
  return name.startsWith(`${location}/`) ? name.slice(location.length + 1) : path.posix.basename(name);
}

/** The repository paths of one source artifact in the working tree: its folder or file, adapter files excluded. */
function localFiles(project, location) {
  const names = gitNames(project, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", location);
  return [...new Set(names)].filter((name) => !isAdapterFile(relativeTo(location, name)) && fs.existsSync(path.join(project, ...name.split("/")))).sort();
}

/** The repository paths under `paths` at a commit, adapter files excluded. */
function filesAt(project, commit, location, paths) {
  return gitNames(project, "ls-tree", "-r", "-z", "--name-only", commit, "--", ...paths).filter((name) => !isAdapterFile(relativeTo(location, name))).sort();
}

/** The parsed JSON of a file at a commit (or of the working tree for a null commit); an empty object when missing or invalid. */
function jsonAt(project, commit, file) {
  const text = commit === null ? (fs.existsSync(path.join(project, file)) ? fs.readFileSync(path.join(project, file), "utf8") : null) : gitTry(project, "cat-file", "blob", `${commit}:${file}`);
  try {
    const value = text === null ? {} : JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * The workflow lock to publish with one workflow: the lock at `commit` with only this workflow's entry taken from the
 * checkout, so the entries of other workflows stay as the remote has them. Null when that entry is the same.
 */
function lockWithEntry(project, commit, name) {
  const remote = jsonAt(project, commit, WORKFLOWS_LOCK);
  const local = jsonAt(project, null, WORKFLOWS_LOCK);
  if (JSON.stringify(local[name]) === JSON.stringify(remote[name])) {
    return null;
  }
  const merged = { ...remote };
  if (Object.hasOwn(local, name)) {
    merged[name] = local[name];
  } else {
    delete merged[name];
  }
  const keys = Object.keys(remote);
  const sorted = keys.every((key, index) => index === 0 || keys[index - 1].localeCompare(key) <= 0);
  const ordered = sorted ? Object.fromEntries(Object.keys(merged).sort().map((key) => [key, merged[key]])) : merged;
  return Buffer.from(`${JSON.stringify(ordered, null, 2)}\n`);
}

/** The files a publish branch holds for one artifact, by repository path: its working-tree files, and for a workflow its lock entry. */
function wantedFiles(project, spec, remoteCommit) {
  const wanted = new Map(localFiles(project, spec.location).map((name) => [name, fs.readFileSync(path.join(project, ...name.split("/")))]));
  const lock = spec.kind === "workflow" && remoteCommit ? lockWithEntry(project, remoteCommit, spec.name) : null;
  if (lock) {
    wanted.set(WORKFLOWS_LOCK, lock);
  }
  return wanted;
}

/** The SHA-256 of every wanted file by repository path. */
function hashesOfWanted(wanted) {
  return Object.fromEntries([...wanted].map(([name, buffer]) => [name, sha256(buffer)]));
}

/** The wanted files that differ from a commit under `paths`: added, modified or deleted, with a short diff. */
function changedFiles(project, commit, location, wanted, paths) {
  const remote = filesAt(project, commit, location, paths);
  const files = [];
  for (const name of [...new Set([...wanted.keys(), ...remote])].sort()) {
    const localText = wanted.has(name) ? normalizeText(wanted.get(name).toString("utf8")) : undefined;
    const remoteText = remote.includes(name) ? normalizeText(gitRaw(project, "cat-file", "blob", `${commit}:${name}`)) : undefined;
    if (remoteText === undefined) {
      files.push({ path: name, change: "added", diff: [] });
    } else if (localText === undefined) {
      files.push({ path: name, change: "deleted", diff: [] });
    } else if (localText !== remoteText) {
      files.push({ path: name, change: "modified", diff: diffLines(remoteText, localText) });
    }
  }
  return files;
}

/** True when the remote changed the artifact (for a workflow also its lock entry) between the checkout's merge base and `commit`. */
function remoteChanged(project, base, commit, spec) {
  if (!base) {
    return true;
  }
  if (runGit(project, ["diff", "--quiet", base, commit, "--", spec.location]).status !== 0) {
    return true;
  }
  return spec.kind === "workflow" && JSON.stringify(jsonAt(project, base, WORKFLOWS_LOCK)[spec.name]) !== JSON.stringify(jsonAt(project, commit, WORKFLOWS_LOCK)[spec.name]);
}

/** The `version:` of a workflow YAML text, or null without one. */
function workflowVersion(text) {
  return text?.match(/^version:\s*["']?([^"'\s]+)/m)?.[1] ?? null;
}

/** The version of an artifact at a commit (registry or manifest first, front matter or YAML `version` else), or null. */
function versionAt(project, spec, commit) {
  if (!commit) {
    return null;
  }
  if (spec.kind === "workflow") {
    return workflowVersion(gitTry(project, "cat-file", "blob", `${commit}:${spec.location}`));
  }
  return marketplaceVersions(project, spec.kind, spec.location, 1, commit).versions[0]?.version ?? null;
}

/** The version of an artifact in the working tree, read as at a commit. */
function localVersion(project, spec) {
  if (spec.kind === "workflow") {
    const file = path.join(project, ...spec.location.split("/"));
    return fs.existsSync(file) ? workflowVersion(fs.readFileSync(file, "utf8")) : null;
  }
  return workingTreeVersion(project, spec.kind, spec.location);
}

/**
 * The version conflict of a row, or null: the same version on both sides of a content change (the local copy and the
 * version it came from, or the local copy and the marketplace), or both sides bumping the version to different values.
 */
export function versionConflict({ local, base, upstream, differsFromBase, differsFromUpstream }) {
  if (local && base && upstream && local !== base && upstream !== base && local !== upstream) {
    return `Version conflict: local ${local}, marketplace ${upstream}`;
  }
  if (local && ((differsFromBase && local === base) || (differsFromUpstream && local === upstream))) {
    return `Version conflict: same version ${local}, different content`;
  }
  return null;
}

/** The version conflict of a publish row: the working tree against the merge base and the remote commit. */
function publishVersionConflict(project, spec, base, remoteCommit, changedFromRemote) {
  const ownFiles = new Map(localFiles(project, spec.location).map((name) => [name, fs.readFileSync(path.join(project, ...name.split("/")))]));
  const differsFromBase = base ? changedFiles(project, base, spec.location, ownFiles, [spec.location]).length > 0 : false;
  return versionConflict({ local: localVersion(project, spec), base: versionAt(project, spec, base), upstream: versionAt(project, spec, remoteCommit), differsFromBase, differsFromUpstream: changedFromRemote });
}

/** The publish row of one changed source artifact or workflow, or null when nothing differs from the remote. */
function publishItem(project, spec, remote) {
  const id = `${PUBLISH}:${spec.kind}:${spec.name}`;
  const wanted = wantedFiles(project, spec, remote?.remoteCommit ?? null);
  const paths = [spec.location, ...(wanted.has(WORKFLOWS_LOCK) ? [WORKFLOWS_LOCK] : [])];
  const fileHashes = hashesOfWanted(wanted);
  const contentHash = sha256(Object.entries(fileHashes).map(([name, hash]) => `${name}\0${hash}\n`).join(""));
  const common = { id, action: PUBLISH, kind: spec.kind, name: spec.name, state: spec.state, location: spec.location, paths, branch: `${BRANCH_PREFIX}-${spec.kind}-${spec.name}-${contentHash.slice(0, BRANCH_HASH)}`, fileHashes };
  if (!remote) {
    return { ...common, remoteRef: null, baseBranch: null, remoteCommit: null, remoteChanged: false, versionConflict: null, files: Object.keys(fileHashes).map((name) => ({ path: name, change: "added", diff: [] })) };
  }
  const files = changedFiles(project, remote.remoteCommit, spec.location, wanted, paths);
  if (files.length === 0) {
    return null;
  }
  const base = gitTry(project, "merge-base", "HEAD", remote.remoteCommit);
  return { ...common, ...remote, remoteChanged: remoteChanged(project, base, remote.remoteCommit, spec), versionConflict: publishVersionConflict(project, spec, base, remote.remoteCommit, true), files };
}

/** The changed factory workflows the status lists, as publish specs. */
function workflowSpecs(project, status, remote) {
  const names = Array.isArray(status.localWorkflows) ? status.localWorkflows.filter((name) => NAME.test(String(name))) : [];
  return names.map((name) => {
    const location = `factory/workflows/${name}.yaml`;
    const onRemote = remote ? gitTry(project, "cat-file", "-e", `${remote.remoteCommit}:${location}`) !== null : false;
    return { kind: "workflow", name, location, state: onRemote ? "modified" : "local-only" };
  });
}

/** The source rows of a marketplace source checkout: the pull row first, then one publish row per changed artifact or workflow in id order. */
export function sourceItems(project, status) {
  const remote = defaultRemote(project);
  const changed = status.artifacts.filter((artifact) => artifact.harness === SOURCE_HARNESS && PUBLISHED_STATES.includes(artifact.state) && SOURCE_LOCATION.test(artifact.location ?? ""));
  const specs = [...changed.map((artifact) => ({ kind: artifact.kind, name: artifact.name, location: artifact.location, state: artifact.state })), ...workflowSpecs(project, status, remote)];
  const publish = specs.map((spec) => publishItem(project, spec, remote)).filter(Boolean).sort((left, right) => left.id.localeCompare(right.id));
  const pull = pullItem(project, remote);
  return [...(pull ? [pull] : []), ...publish];
}

/** A source item of the plan, checked: its id, kind, name, location, paths, branch and commits are what prepare writes. */
function checkItem(item) {
  if (item.action === PULL) {
    if (item.id !== PULL || !COMMIT.test(String(item.head)) || !COMMIT.test(String(item.remoteCommit)) || !isRefName(item.branch) || !isRefName(item.remoteRef)) {
      throw new Error(`The plan holds an invalid item: ${item.id}`);
    }
    return;
  }
  const kindOk = PUBLISHED_KINDS.includes(item.kind) && NAME.test(String(item.name));
  const branchOk = item.branch === `${BRANCH_PREFIX}-${item.kind}-${item.name}-${String(item.branch).slice(-BRANCH_HASH)}` && /^[0-9a-f]+$/.test(String(item.branch).slice(-BRANCH_HASH));
  const remoteOk = item.remoteCommit === null || (COMMIT.test(String(item.remoteCommit)) && isRefName(item.baseBranch) && isRefName(item.remoteRef));
  const pathsOk = Array.isArray(item.paths) && item.paths[0] === item.location && item.paths.slice(1).every((extra) => item.kind === "workflow" && extra === WORKFLOWS_LOCK) && item.paths.length <= 2;
  if (!kindOk || item.id !== `${PUBLISH}:${item.kind}:${item.name}` || !isLocationOf(item) || !pathsOk || !branchOk || !remoteOk) {
    throw new Error(`The plan holds an invalid item: ${item.id}`);
  }
}

/** True for a string that is a safe git ref name. */
function isRefName(value) {
  return typeof value === "string" && REF_NAME.test(value);
}

/** True when the location of a publish item is the source path of exactly its kind and name. */
function isLocationOf(item) {
  const location = String(item.location);
  if (!SOURCE_LOCATION.test(location)) {
    return false;
  }
  if (item.kind === "agent") {
    return location === `agents/opencode/${item.name}.md`;
  }
  if (item.kind === "workflow") {
    return location === `factory/workflows/${item.name}.yaml`;
  }
  return location.startsWith("skills/") && path.posix.basename(location) === item.name;
}

/** The untracked files (not ignored) that the commits between `head` and `commit` would write over. */
function overwrittenUntracked(project, head, commit) {
  const incoming = new Set(gitNames(project, "diff", "--name-only", "-z", "--no-renames", "--diff-filter=AR", head, commit));
  return gitNames(project, "ls-files", "-z", "--others", "--exclude-standard").filter((name) => incoming.has(name));
}

/** Why the pull row may not be applied now, one reason per problem; empty when it may. */
function pullRefusals(project, item) {
  const head = gitTry(project, "rev-parse", "HEAD");
  const branch = gitTry(project, "symbolic-ref", "--quiet", "--short", "HEAD");
  const reasons = [];
  if (head !== item.head || branch !== item.branch) {
    reasons.push("The checkout moved after prepare");
  }
  const dirty = uncommittedFiles(project);
  if (dirty.length > 0) {
    reasons.push(`The checkout has uncommitted changes: ${dirty.join(", ")}`);
  }
  const overwritten = head ? overwrittenUntracked(project, head, item.remoteCommit) : [];
  if (overwritten.length > 0) {
    reasons.push(`The checkout has untracked files the pull would overwrite: ${overwritten.join(", ")}`);
  }
  const ahead = head ? countBetween(project, item.remoteCommit, head) : 0;
  if (ahead > 0) {
    reasons.push(`The checkout has ${plural(ahead, "commit")} that ${ahead === 1 ? "is" : "are"} not on ${item.remoteRef}`);
  }
  return reasons;
}

/** Why a publish row may not be applied now, one reason per problem; empty when it may. */
function publishRefusals(project, item) {
  const reasons = [];
  if (item.remoteCommit === null) {
    reasons.push(`The checkout has no ${REMOTE} default branch to open a PR against`);
  }
  if (item.remoteChanged) {
    reasons.push(`${item.remoteRef} changed this ${item.kind} after the checkout's commit; pull and merge first, so newer remote text is not replaced`);
  }
  const now = hashesOfWanted(wantedFiles(project, item, item.remoteCommit));
  const recorded = item.fileHashes && typeof item.fileHashes === "object" ? item.fileHashes : {};
  const names = new Set([...Object.keys(now), ...Object.keys(recorded)]);
  if ([...names].some((name) => now[name] !== recorded[name])) {
    reasons.push("The checkout copy changed after prepare");
  }
  return reasons;
}

/** Why apply refuses one source item, one reason per problem; empty when it may be applied. Throws for an invalid item. */
export function sourceRefusals(project, item) {
  checkItem(item);
  return item.action === PULL ? pullRefusals(project, item) : publishRefusals(project, item);
}

/** The lines of a publish row that say what changed per file. */
function fileLines(item) {
  return item.files.flatMap((file) => [`${file.path} (${file.change})`, ...file.diff.map((line) => `    ${line}`)]);
}

/** One row of the merge question for a source item; checked only when apply would take it as it is now. */
export function sourceRow(project, item) {
  const refusals = sourceRefusals(project, item);
  const refused = refusals.map((reason) => `${reason}; apply refuses this row.`);
  if (item.action === PULL) {
    return {
      id: item.id,
      label: `Pull ${plural(item.behind, "commit")} from ${item.remoteRef} (fast-forward)`,
      detail: [...refused, `Commits to pull onto ${item.branch}:`, ...item.commits.map((line) => `  ${line}`), ...(item.behind > item.commits.length ? [`  ... ${item.behind - item.commits.length} more`] : [])].join("\n"),
      checked: refusals.length === 0,
    };
  }
  const unsure = item.state === "unknown-base" ? [`Unsure: this ${item.kind} shares no file with any marketplace version; check the change by hand.`] : [];
  const conflict = typeof item.versionConflict === "string" ? [item.versionConflict] : [];
  return {
    id: item.id,
    label: `${item.kind} ${item.name} (${item.state}): draft PR from ${item.branch}`,
    detail: [...refused, ...conflict, ...unsure, `Draft PR against ${item.remoteRef ?? "the remote default branch"} after the sanitize gate passes. Files:`, ...fileLines(item)].join("\n"),
    checked: refusals.length === 0 && conflict.length === 0 && unsure.length === 0,
  };
}

/** Fast-forwards the checkout to the remote commit prepare showed. */
function applyPull(project, item) {
  gitOut(project, "merge", "--ff-only", "--quiet", item.remoteCommit);
  return { id: item.id, result: `pulled ${plural(item.behind, "commit")}`, upstream: false };
}

/** The title, body and commit message of the draft PR of one publish row. */
function prTexts(item) {
  const verb = item.state === "local-only" ? "add" : "update";
  const title = `${item.state === "local-only" ? "feat" : "fix"}(${item.kind}s): ${verb} ${item.name}`;
  const files = item.files.map((file) => `- ${file.path} (${file.change})`);
  const body = [`Local change of the ${item.kind} \`${item.name}\` from a marketplace source checkout.`, "", "Files:", ...files, "", "Opened as a draft after the sanitize gate passed. Review it, then merge or close it.", ""].join("\n");
  return { title, body, message: `${title}\n\n${files.join("\n")}\n` };
}

/** The hits of a sanitize report as labels only, never values. */
function hitText(hits) {
  return hits.map((hit) => `${hit.file}:${hit.line} ${hit.term}`).join(", ");
}

/** Writes the wanted files of a publish row into the worktree, removes the files the checkout removed, and stages them. */
function stageArtifact(project, worktree, item) {
  const wanted = wantedFiles(project, item, item.remoteCommit);
  for (const name of filesAt(worktree, "HEAD", item.location, item.paths).filter((remoteName) => !wanted.has(remoteName))) {
    fs.rmSync(path.join(worktree, ...name.split("/")));
  }
  for (const [name, buffer] of wanted) {
    const target = path.join(worktree, ...name.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
  }
  gitOut(worktree, "add", "-A", "--", ...item.paths);
}

/** Runs the sanitize gate on the staged commit and the texts; returns the reason it blocks, or null when it passes. */
function gateBlock(project, worktree, textFiles, termsFile) {
  try {
    const report = scan({ staged: worktree, texts: textFiles, project, termsFile, configOnly: true });
    return report.clean ? null : `sanitize gate: ${hitText(report.hits)}`;
  } catch (error) {
    if (error instanceof GateError) {
      return `sanitize gate failed: ${error.code}`;
    }
    throw error;
  }
}

/** Commits, pushes the branch and opens the draft PR of a staged publish row that passed the gate. */
function publishStaged({ project, worktree, item, texts, files, gh }) {
  gitOut(worktree, "commit", "--quiet", "-F", files.message);
  if (gitOut(project, "ls-remote", "--heads", REMOTE, `refs/heads/${item.branch}`) !== "") {
    return { id: item.id, result: "already on the remote", upstream: false, branch: item.branch };
  }
  gitOut(worktree, "push", "--quiet", REMOTE, `HEAD:refs/heads/${item.branch}`);
  const created = gh(["pr", "create", "--draft", "--base", item.baseBranch, "--head", item.branch, "--title", texts.title, "--body-file", files.body], { cwd: project });
  if (created.status !== 0) {
    return { id: item.id, result: "failed", upstream: false, branch: item.branch, reason: `gh pr create failed: ${String(created.stderr ?? "").trim().slice(-ERROR_TAIL)}` };
  }
  return { id: item.id, result: "draft PR opened", upstream: false, branch: item.branch, url: String(created.stdout).trim().split("\n").pop() };
}

/** Puts one publish row on its branch in a temporary worktree, runs the gate and opens the draft PR; removes only that worktree. */
function applyPublish(project, item, { gh, termsFile }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-publish-"));
  const worktree = path.join(tempDir, "worktree");
  try {
    gitOut(project, "worktree", "add", "--quiet", "--detach", worktree, item.remoteCommit);
    stageArtifact(project, worktree, item);
    const texts = prTexts(item);
    const files = { title: path.join(tempDir, "title.txt"), body: path.join(tempDir, "body.md"), message: path.join(tempDir, "message.txt") };
    for (const [key, file] of Object.entries(files)) {
      fs.writeFileSync(file, texts[key]);
    }
    const blocked = gateBlock(project, worktree, Object.values(files), termsFile);
    if (blocked) {
      return { id: item.id, result: "blocked", upstream: false, reason: blocked };
    }
    return publishStaged({ project, worktree, item, texts, files, gh });
  } finally {
    runGit(project, ["worktree", "remove", "--force", worktree]);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Runs gh without a shell; on Windows only from an absolute PATH folder. */
function runGh(args, { cwd }) {
  return spawnSync(resolveGh({ cwd }), args, { cwd, encoding: "utf8", shell: false });
}

/**
 * Applies the selected source items, the pull row first, then each publish row; the caller checked them with
 * `sourceRefusals`. Returns one result per item: pulled, draft PR opened (with its branch and URL), already on the
 * remote, blocked by the sanitize gate (hits by label only) or failed (a failed row does not stop the next one).
 */
export function applySource(project, items, { gh = runGh, termsFile } = {}) {
  const ordered = [...items.filter((item) => item.action === PULL), ...items.filter((item) => item.action === PUBLISH)];
  return ordered.map((item) => (item.action === PULL ? pullOrFail(project, item) : publishOrFail(project, item, { gh, termsFile })));
}

/** Applies the pull row; a git failure is reported as that row's result with git's error, never thrown. */
function pullOrFail(project, item) {
  try {
    return applyPull(project, item);
  } catch (error) {
    return { id: item.id, result: "failed", upstream: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Applies one publish row; a git failure fails that row only and is reported with git's error. */
function publishOrFail(project, item, options) {
  try {
    return applyPublish(project, item, options);
  } catch (error) {
    return { id: item.id, result: "failed", upstream: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
