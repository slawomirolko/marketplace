// Plans the marketplace pull request for one changed artifact.
//
// Deterministic: it reads the staged portable copy, the classification of the
// change, the open upstream PRs and the artifact's lock entry, and decides
// whether to open a new draft PR, append to an open one, or skip. It never
// calls git or GitHub; the caller performs the plan.
//
// Usage:
//   node scripts/olko-upstream-plan.mjs --artifact <skill:x|agent:x> --stage <dir>
//        --classification <json> --open-prs <json> (--lock-entry <json> | --project <dir>) [--json]
//
// classification: { hunks: [{ file, kind: "portable" | "adapter", text }] }; the PR body
//                 lists only staged file names (from the stage directory) that have a portable hunk
// open PRs:       [{ number, branch, contentHash, base, artifact? }], or the output of
//                 `gh pr list --json number,headRefName,body` (read from the PR body);
//                 `--open-prs gh:<repo dir>` lists the open `upstream-candidate` PRs with gh
// lock entry:     the artifact's entry from .agents/marketplace.lock.json

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hashFiles, isAdapterFile, isArtifactId, normalizeText, readLock } from "./olko-marketplace-lock.mjs";

export const LABEL = "upstream-candidate";
export const PR_LIST_LIMIT = 1000;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stagedFiles(stage) {
  const files = new Map();
  for (const entry of fs.readdirSync(stage, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
    const relative = path.relative(stage, absolute).split(path.sep).join("/");
    if (!isAdapterFile(relative)) {
      files.set(relative, normalizeText(fs.readFileSync(absolute, "utf8")));
    }
  }
  return files;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** A PR belongs to the artifact named in its body; only a PR without one is matched by its branch name. */
function belongsTo(pr, artifact, branchPrefix) {
  if (pr.artifact) {
    return pr.artifact === artifact;
  }
  const rest = pr.branch?.startsWith(branchPrefix) ? pr.branch.slice(branchPrefix.length) : "";
  return /^[0-9a-f]{8}(?:-\d+)?$/.test(rest);
}

function baseOf(lockEntry) {
  return lockEntry.version ?? lockEntry.nearestVersion ?? "unknown";
}

function body({ artifact, base, files, portable, adapterCount, contentHash }) {
  return [
    `Upstream candidate for \`${artifact}\`, found in a project that uses the marketplace.`,
    "",
    `- Base version: ${base}`,
    `- Changed files: ${files.map((file) => `\`${file}\``).join(", ") || "none"}`,
    `- Portable hunks: ${portable.length}`,
    `- Project-specific hunks kept in the project adapter: ${adapterCount}`,
    `- Content hash: \`${contentHash}\``,
    "",
    "The change passed the sanitize gate before this PR was opened.",
    "This PR stays a draft. Merging or closing it is the maintainer's decision.",
  ].join("\n");
}

// Accepts both shapes: our own and gh's (number, headRefName, body).
export function normalizePr(pr) {
  const body = typeof pr.body === "string" ? pr.body : "";
  return {
    number: pr.number,
    branch: pr.branch ?? pr.headRefName,
    contentHash: pr.contentHash ?? body.match(/Content hash: `([0-9a-f]{64})`/)?.[1] ?? null,
    base: pr.base ?? body.match(/Base version: (\S+)/)?.[1] ?? null,
    artifact: pr.artifact ?? body.match(/Upstream candidate for `([^`]+)`/)?.[1] ?? null,
  };
}

export function plan({ artifact, stage, classification, openPrs, lockEntry }) {
  const [kind, name] = artifact.split(":");
  if (!isArtifactId(artifact)) throw new Error("--artifact must be skill:<name> or agent:<name>");
  const hunks = classification.hunks ?? [];
  const portable = hunks.filter((hunk) => hunk.kind === "portable");
  const localAdapter = hunks.filter((hunk) => hunk.kind === "adapter").map(({ file, text }) => ({ file, text }));
  const staged = stagedFiles(stage);
  const contentHash = hashFiles(staged).hash.slice("sha256:".length);
  const portableFiles = new Set(portable.map((hunk) => hunk.file));
  const files = [...staged.keys()].filter((file) => portableFiles.has(file)).sort();
  const base = baseOf(lockEntry);
  const branchPrefix = `feature/upstream-${kind}-${slug(name)}-`;
  const prs = openPrs.map(normalizePr).filter((pr) => belongsTo(pr, artifact, branchPrefix));

  const common = { artifact, base, contentHash, localAdapter, draft: true, labels: [LABEL] };
  if ((lockEntry.rejected ?? []).includes(contentHash)) return { ...common, action: "skip", reason: "rejected" };
  if (lockEntry.pending?.contentHash === contentHash || prs.some((pr) => pr.contentHash === contentHash)) {
    return { ...common, action: "skip", reason: "duplicate" };
  }
  if (portable.length === 0) return { ...common, action: "skip", reason: "adapter-only" };

  const title = `feat(${kind}s): upstream change to ${name}`;
  const text = body({ artifact, base, files, portable, adapterCount: localAdapter.length, contentHash });
  const sameBase = prs.find((pr) => pr.base === base);
  if (sameBase) {
    return { ...common, action: "append", pr: sameBase.number, branch: sameBase.branch, title, body: text };
  }
  const taken = new Set(prs.map((pr) => pr.branch));
  let branch = `${branchPrefix}${contentHash.slice(0, 8)}`;
  for (let suffix = 2; taken.has(branch); suffix += 1) branch = `${branchPrefix}${contentHash.slice(0, 8)}-${suffix}`;
  return { ...common, action: "open", branch, title, body: text };
}

/**
 * The gh executable to run without a shell. On Windows a bare name would also be looked up in
 * the working directory, so gh.exe is taken only from an absolute PATH folder.
 */
export function resolveGh({ platform = process.platform, env = process.env, cwd = process.cwd() } = {}) {
  if (platform !== "win32") {
    return "gh";
  }
  const pathValue = env.PATH ?? env.Path ?? "";
  for (const folder of pathValue.split(";")) {
    const trimmed = folder.trim().replace(/^"|"$/g, "");
    if (!path.win32.isAbsolute(trimmed) || path.resolve(trimmed) === path.resolve(cwd)) {
      continue;
    }
    const candidate = path.join(trimmed, "gh.exe");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("gh.exe was not found in an absolute PATH folder");
}

/** Parses `gh pr list` output and refuses a list that reached the limit, since it may be cut off. */
export function parsePrList(stdout, limit = PR_LIST_LIMIT) {
  const prs = JSON.parse(stdout);
  if (prs.length >= limit) {
    throw new Error(`gh pr list returned ${prs.length} open PRs, its limit; the list may be cut off`);
  }
  return prs;
}

function openPrsOf(source) {
  if (!source.startsWith("gh:")) return readJson(source);
  const args = ["pr", "list", "--state", "open", "--label", LABEL, "--json", "number,headRefName,body", "--limit", String(PR_LIST_LIMIT)];
  const result = spawnSync(resolveGh(), args, { cwd: source.slice(3), encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`gh pr list failed: ${result.stderr.trim().slice(-300)}`);
  return parsePrList(result.stdout);
}

function lockEntryOf(project, artifact) {
  const lock = readLock(path.resolve(project));
  if (!isArtifactId(artifact) || !lock || !Object.hasOwn(lock, artifact)) {
    throw new Error("The artifact is not in the project's marketplace lock");
  }
  return lock[artifact];
}

function parseArgs(argv) {
  const options = {};
  const flags = { "--artifact": "artifact", "--stage": "stage", "--classification": "classification", "--open-prs": "openPrs", "--lock-entry": "lockEntry", "--project": "project" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (flags[argument]) options[flags[argument]] = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  for (const required of ["artifact", "stage", "classification", "openPrs"]) {
    if (!options[required]) throw new Error(`Missing ${Object.keys(flags).find((flag) => flags[flag] === required)}`);
  }
  if (!options.lockEntry && !options.project) throw new Error("Missing --lock-entry or --project");
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = plan({
    artifact: options.artifact,
    stage: path.resolve(options.stage),
    classification: readJson(options.classification),
    openPrs: openPrsOf(options.openPrs),
    lockEntry: options.lockEntry ? readJson(options.lockEntry) : lockEntryOf(options.project, options.artifact),
  });
  console.log(JSON.stringify(result, null, options.json ? 2 : 0));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
