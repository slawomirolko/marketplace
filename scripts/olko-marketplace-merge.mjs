/**
 * Three-way merge of marketplace skills and agents installed in one project.
 *
 * `prepare` takes every installed artifact that is `outdated`, or `modified` while the marketplace has
 * moved on, and builds the proposed copy of each: the marketplace version the copy came from (base), the
 * project copy without its adapter (local) and the marketplace default branch (upstream) are merged file by
 * file with `git merge-file`. It writes only into its own output folder, never into the project or the
 * marketplace, and records what it found in `<out>/plan.json`.
 *
 * What is installed, its portable content and its marketplace history come from the installed-artifact model
 * of the olko-factory-project skill, and the states from its project status, so the merge and the status agree.
 * A marketplace source checkout (harness `source`) is never merged.
 *
 * This is a marketplace gate: it runs from a marketplace checkout (`<marketplace>/scripts/`), never from an
 * installed skill. See "Script ownership" in docs/project-change-upstream.md.
 *
 * Usage:
 *   node scripts/olko-marketplace-merge.mjs prepare --project <dir> --marketplace <dir> --out <dir> [--no-fetch] [--json]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_DEPTH,
  git,
  installedArtifacts,
  marketplaceVersions,
} from "../skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs";
import { projectStatus } from "../skills/software-factory/olko-factory-project/scripts/project-scan.mjs";
import { readLock } from "./olko-marketplace-lock.mjs";
import { parseFlags } from "./lib/cli.mjs";

const SOURCE_HARNESS = "source";
const FRONT_MATTER_FENCE = "---\n";
const PREPARE = "prepare";
const MERGE_LABELS = ["-L", "local", "-L", "base", "-L", "upstream"];
const MAX_CONFLICT_STATUS = 127;

/** An artifact state that a merge can bring up to date. */
function isMergeable(artifact) {
  if (artifact.harness === SOURCE_HARNESS) {
    return false;
  }
  return artifact.state === "outdated" || (artifact.state === "modified" && artifact.upstreamMoved === true);
}

/** True when `commit` is a commit of the marketplace. */
function isCommit(marketplace, commit) {
  try {
    git(marketplace, "cat-file", "-e", `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/** The marketplace version of a source path at or before `commit`, or null when the path does not exist there. */
function versionAt(marketplace, kind, source, commit) {
  return marketplaceVersions(marketplace, kind, source, 1, commit).versions[0] ?? null;
}

/**
 * The base of a group of copies. A `modified` copy takes the project lock's `sourceCommit` when the
 * marketplace has it and the lock entry is for one of the group's locations; else the base is the scan's
 * guess. An `outdated` copy equals a marketplace version exactly, so the scan's base is never a guess.
 */
function baseOf(marketplace, lock, status, locations, source) {
  const entry = lock && Object.hasOwn(lock, status.id) ? lock[status.id] : null;
  const lockCommit = typeof entry?.sourceCommit === "string" ? entry.sourceCommit : null;
  const lockCovers = entry && (entry.location === undefined || locations.includes(entry.location));
  if (status.state === "modified" && lockCommit && lockCovers && isCommit(marketplace, lockCommit)) {
    const version = versionAt(marketplace, status.kind, source, lockCommit);
    if (version) {
      return { commit: lockCommit, version, guessed: false };
    }
  }
  const version = versionAt(marketplace, status.kind, source, status.base);
  return { commit: status.base, version, guessed: status.state === "modified" };
}

/** Runs `git merge-file` on three texts; returns the merged text and whether it holds conflicts. */
function mergeText(tempDir, local, base, upstream) {
  const files = { local, base, upstream };
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(tempDir, name), text);
  }
  const result = spawnSync("git", ["merge-file", "-p", ...MERGE_LABELS, "local", "base", "upstream"], { cwd: tempDir, encoding: "utf8" });
  if (result.status === null || result.status > MAX_CONFLICT_STATUS) {
    throw new Error(`git merge-file failed: ${result.stderr}`);
  }
  return { text: result.stdout, conflict: result.status > 0 };
}

/** The merge of one file; `local`, `base` and `upstream` are text or undefined for an absent file. */
function mergeFile(tempDir, local, base, upstream) {
  if (local === upstream) {
    return { result: "clean", text: local };
  }
  if (local === base) {
    return { result: "upstream", text: upstream };
  }
  if (upstream === base) {
    return { result: "local", text: local };
  }
  if (local === undefined) {
    return { result: "conflict", conflictKind: "deleted-locally", text: upstream };
  }
  if (upstream === undefined) {
    return { result: "conflict", conflictKind: "deleted-upstream", text: local };
  }
  const merged = mergeText(tempDir, local, base ?? "", upstream);
  return merged.conflict ? { result: "conflict", conflictKind: "both-edited", text: merged.text } : { result: "clean", text: merged.text };
}

/** The text with the project's `model:` line put back at the end of its front matter. */
function withModelLine(text, model) {
  if (!model || !text.startsWith(FRONT_MATTER_FENCE)) {
    return text;
  }
  const end = text.indexOf("\n---", FRONT_MATTER_FENCE.length);
  return end < 0 ? text : `${text.slice(0, end)}\n${model}${text.slice(end)}`;
}

/** Merges every file of a copy; returns the file records and the proposed copy (path to text). */
function mergeCopy({ kind, local, base, upstream, model }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-merge-"));
  try {
    const files = [];
    const proposed = new Map();
    const names = [...new Set([...local.keys(), ...base.keys(), ...upstream.keys()])].sort();
    for (const name of names) {
      const merged = mergeFile(tempDir, local.get(name), base.get(name), upstream.get(name));
      const text = kind === "agent" && merged.text !== undefined ? withModelLine(merged.text, model) : merged.text;
      if (text !== undefined) {
        proposed.set(name, text);
      }
      const unchanged = local.get(name) === base.get(name) && upstream.get(name) === base.get(name);
      if (!unchanged) {
        files.push({ path: name, result: merged.result, ...(merged.conflictKind ? { conflictKind: merged.conflictKind } : {}) });
      }
    }
    return { files, proposed };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** The folder name of an item id: letters, digits, dots and dashes only. */
function safeName(id) {
  return id.replace(/[^a-zA-Z0-9.]+/g, "-");
}

/** Writes the proposed files under `dir`, replacing whatever was there. */
function writeProposed(dir, proposed) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [name, text] of proposed) {
    const target = path.resolve(dir, name);
    if (!target.startsWith(`${path.resolve(dir)}${path.sep}`)) {
      throw new Error(`An artifact file path leaves its folder: ${name}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  fs.mkdirSync(dir, { recursive: true });
}

/** Groups the copies of one artifact id whose portable content and model line are the same. */
function groupCopies(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.status.contentHash}\0${entry.copy.model ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()];
}

/** The mergeable status rows with their installed copy, grouped per artifact id in id order. */
function collect(project, status) {
  const copies = new Map(installedArtifacts(project).map((copy) => [copy.location, copy]));
  const byId = new Map();
  for (const artifact of status.artifacts.filter(isMergeable)) {
    const copy = copies.get(artifact.location);
    if (copy) {
      byId.set(artifact.id, [...(byId.get(artifact.id) ?? []), { status: artifact, copy }]);
    }
  }
  return [...byId].sort(([left], [right]) => left.localeCompare(right));
}

/** Builds the plan item of one group of identical copies. */
function buildItem({ marketplace, ref, lock, out, id, group }) {
  const { status, copy } = group[0];
  const locations = group.map((entry) => entry.status.location);
  const base = baseOf(marketplace, lock, status, locations, status.source);
  const upstream = marketplaceVersions(marketplace, status.kind, status.source, 1, ref).versions[0];
  const merged = mergeCopy({ kind: status.kind, local: copy.contents, base: base.version?.contents ?? new Map(), upstream: upstream.contents, model: copy.model });
  const dir = path.join(out, safeName(id));
  writeProposed(dir, merged.proposed);
  const conflicts = merged.files.filter((file) => file.result === "conflict").length;
  return {
    id,
    kind: status.kind,
    name: status.name,
    state: status.state,
    locations,
    base: base.commit,
    baseGuessed: base.guessed,
    versions: { local: base.version?.version ?? null, upstream: upstream.version ?? null, localCommit: base.version?.commit ?? base.commit, upstreamCommit: upstream.commit },
    files: merged.files,
    dir,
    checked: !base.guessed && conflicts === 0,
  };
}

/**
 * Prepares the merge of every outdated or modified artifact of a project into `out`; writes
 * `<out>/plan.json` and returns the plan. Nothing is written to the project or the marketplace
 * (`fetch` refreshes the marketplace remote refs, as the status scan does).
 */
export function prepare({ project, marketplace, out, fetch = true }) {
  const status = projectStatus({ project, marketplace, factory: path.join(marketplace, "factory"), depth: DEFAULT_DEPTH, fetch });
  const lock = readLock(project);
  fs.mkdirSync(out, { recursive: true });
  const items = [];
  for (const [artifactId, entries] of collect(project, status)) {
    const groups = groupCopies(entries);
    for (const group of groups) {
      const id = groups.length === 1 ? artifactId : `${artifactId}@${group[0].status.location}`;
      items.push(buildItem({ marketplace, ref: status.ref, lock, out, id, group }));
    }
  }
  const plan = {
    project,
    marketplace,
    ref: status.ref,
    head: status.head,
    ids: items.map((item) => item.id),
    conflicts: items.reduce((sum, item) => sum + item.files.filter((file) => file.result === "conflict").length, 0),
    items,
  };
  fs.writeFileSync(path.join(out, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function requireFlag(options, key, flag) {
  if (!options[key]) {
    throw new Error(`Missing ${flag}`);
  }
  return path.resolve(options[key]);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== PREPARE) {
    throw new Error(`Unknown command: ${command}. Use ${PREPARE}.`);
  }
  const options = parseFlags(rest, { values: { "--project": "project", "--marketplace": "marketplace", "--out": "out" }, switches: { "--no-fetch": "noFetch", "--json": "json" } });
  const plan = prepare({
    project: requireFlag(options, "project", "--project"),
    marketplace: requireFlag(options, "marketplace", "--marketplace"),
    out: requireFlag(options, "out", "--out"),
    fetch: !options.noFetch,
  });
  console.log(options.json ? JSON.stringify(plan, null, 2) : JSON.stringify(plan));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
