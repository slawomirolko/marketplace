/**
 * The marketplace source checkout part of `scripts/olko-marketplace-merge.mjs`: the rows of a project that is a
 * marketplace source checkout (it keeps skills under skills/<category>/ and lists them in registry.json).
 *
 * - The pull row (`pull`): the checkout is behind the remote branch its current branch tracks. Applying it
 *   fast-forwards the checkout to exactly the remote commit prepare showed (`git merge --ff-only <commit>`), never a
 *   forced or merge-commit pull. A checkout with uncommitted changes, with commits that are not on the remote or that
 *   moved after prepare is refused.
 * - One publish row per `modified` or `local-only` source skill or agent (`publish:<kind>:<name>`). Applying one
 *   puts exactly that artifact's changed files (adapter files excluded) on the remote default branch in a temporary
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
import { isAdapterFile, normalizeText } from "../skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs";
import { isArtifactId } from "./olko-marketplace-lock.mjs";
import { GateError, scan } from "./olko-sanitize.mjs";
import { resolveGh } from "./olko-upstream-plan.mjs";

export const PULL = "pull";
export const PUBLISH = "publish";
const SOURCE_HARNESS = "source";
const PUBLISHED_STATES = ["modified", "local-only"];
const REMOTE = "origin";
const BRANCH_PREFIX = "feature/upstream";
const BRANCH_HASH = 8;
const SHOWN_COMMITS = 20;
const DIFF_CONTEXT = 1;
const DIFF_LINES = 40;
const ERROR_TAIL = 300;
const COMMIT = /^[0-9a-f]{40,64}$/;
const SOURCE_LOCATION = /^(?:skills\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*|agents\/opencode\/[a-z0-9][a-z0-9-]*\.md)$/;
const GIT_MAX_BUFFER = 256 * 1024 * 1024;

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

/** The pull row, or null when the checkout is not on a branch that tracks a remote branch or is not behind it. */
function pullItem(project) {
  const branch = gitTry(project, "symbolic-ref", "--quiet", "--short", "HEAD");
  const remoteRef = branch ? gitTry(project, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}") : null;
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

/** The repository paths of one source artifact: its folder (or agent file) in the working tree, adapter files excluded. */
function localFiles(project, location) {
  const names = gitNames(project, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", location);
  return [...new Set(names)].filter((name) => !isAdapterFile(relativeTo(location, name)) && fs.existsSync(path.join(project, ...name.split("/")))).sort();
}

/** The path of `name` inside the artifact at `location`; an agent file is its own name. */
function relativeTo(location, name) {
  return name === location ? path.posix.basename(name) : name.slice(location.length + 1);
}

/** The repository paths of one source artifact at a remote commit, adapter files excluded. */
function remoteFiles(project, commit, location) {
  return gitNames(project, "ls-tree", "-r", "-z", "--name-only", commit, "--", location).filter((name) => !isAdapterFile(relativeTo(location, name))).sort();
}

/** The SHA-256 of every working-tree file of a source artifact by repository path. */
function localHashes(project, location) {
  return Object.fromEntries(localFiles(project, location).map((name) => [name, sha256(fs.readFileSync(path.join(project, ...name.split("/"))))]));
}

/** The files of a source artifact that differ from the remote commit: added, modified or deleted, with a short diff. */
function changedFiles(project, commit, location) {
  const local = localFiles(project, location);
  const remote = remoteFiles(project, commit, location);
  const files = [];
  for (const name of [...new Set([...local, ...remote])].sort()) {
    const localText = local.includes(name) ? normalizeText(fs.readFileSync(path.join(project, ...name.split("/")), "utf8")) : undefined;
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

/** True when the remote changed the artifact between the checkout's commit (their merge base) and `commit`. */
function remoteChanged(project, commit, location) {
  const base = gitTry(project, "merge-base", "HEAD", commit);
  if (!base) {
    return true;
  }
  return runGit(project, ["diff", "--quiet", base, commit, "--", location]).status !== 0;
}

/** The publish row of one modified or local-only source artifact, or null when nothing differs from the remote. */
function publishItem(project, artifact, remote) {
  const id = `${PUBLISH}:${artifact.kind}:${artifact.name}`;
  const location = artifact.location;
  const fileHashes = localHashes(project, location);
  const contentHash = sha256(Object.entries(fileHashes).map(([name, hash]) => `${name}\0${hash}\n`).join(""));
  const common = { id, action: PUBLISH, kind: artifact.kind, name: artifact.name, state: artifact.state, location, branch: `${BRANCH_PREFIX}-${artifact.kind}-${artifact.name}-${contentHash.slice(0, BRANCH_HASH)}`, fileHashes };
  if (!remote) {
    return { ...common, remoteRef: null, baseBranch: null, remoteCommit: null, remoteChanged: false, files: Object.keys(fileHashes).map((name) => ({ path: name, change: "added", diff: [] })) };
  }
  const files = changedFiles(project, remote.remoteCommit, location);
  if (files.length === 0) {
    return null;
  }
  return { ...common, ...remote, remoteChanged: remoteChanged(project, remote.remoteCommit, location), files };
}

/** The source rows of a marketplace source checkout: the pull row first, then one publish row per changed artifact in id order. */
export function sourceItems(project, status) {
  const remote = defaultRemote(project);
  const changed = status.artifacts.filter((artifact) => artifact.harness === SOURCE_HARNESS && PUBLISHED_STATES.includes(artifact.state) && SOURCE_LOCATION.test(artifact.location ?? ""));
  const publish = changed.map((artifact) => publishItem(project, artifact, remote)).filter(Boolean).sort((left, right) => left.id.localeCompare(right.id));
  const pull = pullItem(project);
  return [...(pull ? [pull] : []), ...publish];
}

/** A source item of the plan, checked: its id, kind, name, location, branch and commits are what prepare writes. */
function checkItem(item) {
  if (item.action === PULL) {
    if (item.id !== PULL || !COMMIT.test(String(item.head)) || !COMMIT.test(String(item.remoteCommit)) || typeof item.branch !== "string" || typeof item.remoteRef !== "string") {
      throw new Error(`The plan holds an invalid item: ${item.id}`);
    }
    return;
  }
  const kindOk = item.kind === "skill" || item.kind === "agent";
  const branchOk = item.branch === `${BRANCH_PREFIX}-${item.kind}-${item.name}-${String(item.branch).slice(-BRANCH_HASH)}` && /^[0-9a-f]+$/.test(String(item.branch).slice(-BRANCH_HASH));
  const remoteOk = item.remoteCommit === null || (COMMIT.test(String(item.remoteCommit)) && typeof item.baseBranch === "string");
  if (!kindOk || !isArtifactId(`${item.kind}:${item.name}`) || item.id !== `${PUBLISH}:${item.kind}:${item.name}` || !SOURCE_LOCATION.test(String(item.location)) || !branchOk || !remoteOk) {
    throw new Error(`The plan holds an invalid item: ${item.id}`);
  }
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
  const now = localHashes(project, item.location);
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
  return {
    id: item.id,
    label: `${item.kind} ${item.name} (${item.state}): draft PR from ${item.branch}`,
    detail: [...refused, `Draft PR against ${item.remoteRef ?? "the remote default branch"} after the sanitize gate passes. Files:`, ...fileLines(item)].join("\n"),
    checked: refusals.length === 0,
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

/** Copies the working-tree files of a publish row into the worktree and removes the files the checkout removed. */
function stageArtifact(project, worktree, item) {
  const local = localFiles(project, item.location);
  for (const name of remoteFiles(worktree, "HEAD", item.location).filter((remoteName) => !local.includes(remoteName))) {
    fs.rmSync(path.join(worktree, ...name.split("/")));
  }
  for (const name of local) {
    const target = path.join(worktree, ...name.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(project, ...name.split("/")), target);
  }
  gitOut(worktree, "add", "-A", "--", item.location);
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

/** Puts one publish row on its branch in a temporary worktree, runs the gate and opens the draft PR; removes the worktree. */
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
    runGit(project, ["worktree", "prune"]);
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
  return ordered.map((item) => (item.action === PULL ? applyPull(project, item) : publishOrFail(project, item, { gh, termsFile })));
}

/** Applies one publish row; a git failure fails that row only and is reported with git's error. */
function publishOrFail(project, item, options) {
  try {
    return applyPublish(project, item, options);
  } catch (error) {
    return { id: item.id, result: "failed", upstream: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
