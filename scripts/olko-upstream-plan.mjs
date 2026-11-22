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
// classification: { hunks: [{ file, kind: "portable" | "adapter", text }] }
// open PRs:       [{ number, branch, contentHash, base, artifact? }], or the output of
//                 `gh pr list --json number,headRefName,body` (read from the PR body);
//                 `--open-prs gh:<repo dir>` lists the open `upstream-candidate` PRs with gh
// lock entry:     the artifact's entry from .agents/marketplace.lock.json

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hashFiles, isAdapterFile, readLock } from "./olko-marketplace-lock.mjs";

export const LABEL = "upstream-candidate";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stagedFiles(stage) {
  const files = new Map();
  for (const entry of fs.readdirSync(stage, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
    const relative = path.relative(stage, absolute).split(path.sep).join("/");
    if (!isAdapterFile(relative)) files.set(relative, fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n"));
  }
  return files;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function baseOf(lockEntry) {
  return lockEntry.version ?? lockEntry.nearestVersion ?? "unknown";
}

function body({ artifact, base, portable, adapterCount, contentHash }) {
  const files = [...new Set(portable.map((hunk) => hunk.file))].sort();
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
  if (!["skill", "agent"].includes(kind) || !name) throw new Error("--artifact must be skill:<name> or agent:<name>");
  const hunks = classification.hunks ?? [];
  const portable = hunks.filter((hunk) => hunk.kind === "portable");
  const localAdapter = hunks.filter((hunk) => hunk.kind === "adapter").map(({ file, text }) => ({ file, text }));
  const contentHash = hashFiles(stagedFiles(stage)).hash.slice("sha256:".length);
  const base = baseOf(lockEntry);
  const branchPrefix = `feature/upstream-${slug(name)}-`;
  const prs = openPrs.map(normalizePr).filter((pr) => pr.artifact === artifact || pr.branch?.startsWith(branchPrefix));

  const common = { artifact, base, contentHash, localAdapter, draft: true, labels: [LABEL] };
  if ((lockEntry.rejected ?? []).includes(contentHash)) return { ...common, action: "skip", reason: "rejected" };
  if (lockEntry.pending?.contentHash === contentHash || prs.some((pr) => pr.contentHash === contentHash)) {
    return { ...common, action: "skip", reason: "duplicate" };
  }
  if (portable.length === 0) return { ...common, action: "skip", reason: "adapter-only" };

  const title = `feat(${kind}s): upstream change to ${name}`;
  const text = body({ artifact, base, portable, adapterCount: localAdapter.length, contentHash });
  const sameBase = prs.find((pr) => pr.base === base);
  if (sameBase) {
    return { ...common, action: "append", pr: sameBase.number, branch: sameBase.branch, title, body: text };
  }
  const taken = new Set(prs.map((pr) => pr.branch));
  let branch = `${branchPrefix}${contentHash.slice(0, 8)}`;
  for (let suffix = 2; taken.has(branch); suffix += 1) branch = `${branchPrefix}${contentHash.slice(0, 8)}-${suffix}`;
  return { ...common, action: "open", branch, title, body: text };
}

function openPrsOf(source) {
  if (!source.startsWith("gh:")) return readJson(source);
  // A fixed command line, no input in it; the shell lets Windows find gh as .exe or .cmd on PATH.
  const result = spawnSync(`gh pr list --state open --label ${LABEL} --json number,headRefName,body --limit 100`, { cwd: source.slice(3), encoding: "utf8", shell: true });
  if (result.status !== 0) throw new Error(`gh pr list failed: ${result.stderr.trim().slice(-300)}`);
  return JSON.parse(result.stdout);
}

function lockEntryOf(project, artifact) {
  const entry = readLock(path.resolve(project))?.[artifact];
  if (!entry) throw new Error(`${artifact} is not in the project's marketplace lock`);
  return entry;
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
