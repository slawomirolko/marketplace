/**
 * Three-way merge of marketplace skills and agents installed in one project.
 *
 * `prepare` takes every installed artifact that is `outdated`, or `modified` while the marketplace has
 * moved on, and builds the proposed copy of each: the marketplace version the copy came from (base), the
 * project copy without its adapter (local) and the marketplace default branch (upstream) are merged file by
 * file with `git merge-file`. It writes only into its own output folder and the plan file, never into the project or
 * the marketplace. The plan file (`--plan`, default `<out>.plan.json`) lies outside the output folder, so the agent that
 * resolves conflicts in that folder cannot change it; `<out>/plan.json` is a copy for that agent and is never read back.
 * The plan records, per item, the hash of each project copy and of each proposed file. The three sides of each item
 * (base, local without the adapter, upstream) go to `<out>/sides/<item>/`, so the agent needs no other folder and no shell.
 *
 * What is installed, its portable content and its marketplace history come from the installed-artifact model
 * of the olko-factory-project skill, and the states from its project status, so the merge and the status agree.
 * A marketplace source checkout (harness `source`) is never merged.
 *
 * This is a marketplace gate: it runs from a marketplace checkout (`<marketplace>/scripts/`), never from an
 * installed skill. See "Script ownership" in docs/project-change-upstream.md.
 *
 * `apply` then writes the proposed copies of the selected items, and only those, into every location of the
 * project that holds the item, leaves the adapter (`project.md`, `*.local.*`, the agent `model:` line) alone,
 * removes the files the merge removed, and records the new base and the approved content hash in the project's
 * marketplace lock. The project and the marketplace come from its own flags, never from a file. It checks every
 * selected item first and writes nothing when one of them still holds conflict markers, has a conflicted file its
 * `resolution.json` does not name, has a proposed file that changed outside the conflicts or a file not in the plan,
 * or has a project copy that changed after prepare. Then it writes every item, then records every item in the lock.
 *
 * `summary` reads the plan and the `resolution.json` an agent wrote per item and prints the rows of the one
 * merge question: `{ ids, items: [{ id, label, detail, checked }] }`. A row is checked by default only when
 * its base is known, every conflict is resolved and explained, every resolved hunk is marked sure, no proposed file
 * changed outside the conflicts and, for a modified item, its upstream part is classified.
 *
 * Usage:
 *   node scripts/olko-marketplace-merge.mjs prepare --project <dir> --marketplace <dir> --out <dir> [--plan <file>] [--no-fetch] [--json]
 *   node scripts/olko-marketplace-merge.mjs summary --plan <file> [--json]
 *   node scripts/olko-marketplace-merge.mjs apply --plan <file> --project <dir> --marketplace <dir> --selected <id,id,...|none> [--json]
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_DEPTH,
  HASH_PREFIX,
  copyAt,
  copyAtLocation,
  git,
  hashFiles,
  installedArtifacts,
  isAdapterFile,
  marketplaceVersions,
  normalizeText,
  portableText,
} from "../skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs";
import { projectStatus } from "../skills/software-factory/olko-factory-project/scripts/project-scan.mjs";
import { isArtifactId, readLock, record } from "./olko-marketplace-lock.mjs";
import { parseFlags } from "./lib/cli.mjs";

const SOURCE_HARNESS = "source";
const FRONT_MATTER_FENCE = "---\n";
const PREPARE = "prepare";
const SUMMARY = "summary";
const APPLY = "apply";
/** The copy of the plan in the work directory, for the resolve agent only; prepare writes it and nothing reads it back. */
const AGENT_PLAN_FILE = "plan.json";
const PLAN_SUFFIX = ".plan.json";
/** The folder of the work directory that holds the base, local and upstream copy of each item, for the resolve agent; never installed. */
const SIDES_DIR = "sides";
const SHORT_COMMIT = 7;
const DIFF_CONTEXT = 1;
const DIFF_LINES = 40;
/** The file an agent step may write into an item folder; it describes the resolution and is never installed. */
const RESOLUTION_FILE = "resolution.json";
/** A conflict marker line of `git merge-file`, in the merge or the diff3 style. */
const CONFLICT_MARKER = /^(?:<{7}|\|{7}|>{7})(?: .*)?$|^={7}$/m;
const CRLF = /\r\n/;
const NONE = "none";
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

/** The index of the `model:` line among the front matter lines of a copy's file, or -1 without one. */
function modelLineIndex(copyPath) {
  const text = normalizeText(fs.readFileSync(copyPath, "utf8"));
  if (!text.startsWith(FRONT_MATTER_FENCE)) {
    return -1;
  }
  const end = text.indexOf("\n---", FRONT_MATTER_FENCE.length);
  return text.slice(FRONT_MATTER_FENCE.length, end < 0 ? 0 : end).split("\n").findIndex((line) => /^model:/.test(line));
}

/** The text with the project's `model:` line put back at its line index in the front matter (the end when the front matter is shorter). */
function withModelLine(text, model, index) {
  if (!model || !text.startsWith(FRONT_MATTER_FENCE)) {
    return text;
  }
  const end = text.indexOf("\n---", FRONT_MATTER_FENCE.length);
  if (end < 0) {
    return text;
  }
  const front = text.slice(FRONT_MATTER_FENCE.length, end).split("\n");
  front.splice(index < 0 ? front.length : Math.min(index, front.length), 0, model);
  return `${FRONT_MATTER_FENCE}${front.join("\n")}${text.slice(end)}`;
}

/** Merges every file of a copy; returns the file records and the proposed copy (path to text). */
function mergeCopy({ kind, local, base, upstream, model, modelIndex }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-merge-"));
  try {
    const files = [];
    const proposed = new Map();
    const names = [...new Set([...local.keys(), ...base.keys(), ...upstream.keys()])].sort();
    for (const name of names) {
      const merged = mergeFile(tempDir, local.get(name), base.get(name), upstream.get(name));
      const text = kind === "agent" && merged.text !== undefined ? withModelLine(merged.text, model, modelIndex) : merged.text;
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

/** The SHA-256 hex digest of a text or buffer. */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** The SHA-256 of every file under `dir` by relative path; empty when `dir` does not exist. */
function fileHashes(dir) {
  if (!fs.existsSync(dir)) {
    return {};
  }
  return Object.fromEntries(listFiles(dir).map((name) => [name, sha256(fs.readFileSync(path.join(dir, ...name.split("/"))))]));
}

/**
 * The hash of one installed copy as apply would overwrite it, bytes as they are: the agent file, or every file of a
 * skill folder except its adapter. Null when the copy is missing or the location is not an installed location.
 */
function locationHash(project, kind, name, location) {
  const target = copyAtLocation(project, kind, name, location)?.target;
  if (!target || !fs.existsSync(target)) {
    return null;
  }
  if (kind === "agent") {
    return sha256(fs.readFileSync(target));
  }
  const files = Object.entries(fileHashes(target)).filter(([file]) => !isAdapterFile(file));
  return sha256(files.map(([file, hash]) => `${file}\0${hash}\n`).join(""));
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
function buildItem({ project, marketplace, ref, lock, out, id, group }) {
  const { status, copy } = group[0];
  const locations = group.map((entry) => entry.status.location);
  const base = baseOf(marketplace, lock, status, locations, status.source);
  const upstream = marketplaceVersions(marketplace, status.kind, status.source, 1, ref).versions[0];
  const merged = mergeCopy({ kind: status.kind, local: copy.contents, base: base.version?.contents ?? new Map(), upstream: upstream.contents, model: copy.model, modelIndex: copy.model ? modelLineIndex(copy.path) : -1 });
  const dir = path.join(out, safeName(id));
  writeProposed(dir, merged.proposed);
  const sides = path.join(out, SIDES_DIR, safeName(id));
  const texts = { base: base.version?.contents ?? new Map(), local: copy.contents, upstream: upstream.contents };
  for (const [side, files] of Object.entries(texts)) {
    writeProposed(path.join(sides, side), files);
  }
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
    sides,
    proposedHashes: fileHashes(dir),
    projectHashes: Object.fromEntries(locations.map((location) => [location, locationHash(project, status.kind, status.name, location)])),
  };
}

/** The default plan file of a work directory: next to it, outside it. */
export function defaultPlanFile(out) {
  return `${path.resolve(out)}${PLAN_SUFFIX}`;
}

/**
 * Prepares the merge of every outdated or modified artifact of a project into `out`; writes the plan to `plan`
 * (outside `out`) and a copy for the resolve agent to `<out>/plan.json`, and returns the plan. Nothing is written
 * to the project or the marketplace (`fetch` refreshes the marketplace remote refs, as the status scan does).
 */
export function prepare({ project, marketplace, out, plan: planFile = defaultPlanFile(out), fetch = true }) {
  if (isInside(out, planFile)) {
    throw new Error("The plan file must be outside the work directory");
  }
  const status = projectStatus({ project, marketplace, factory: path.join(marketplace, "factory"), depth: DEFAULT_DEPTH, fetch });
  const lock = readLock(project);
  fs.mkdirSync(out, { recursive: true });
  const items = [];
  for (const [artifactId, entries] of collect(project, status)) {
    const groups = groupCopies(entries);
    for (const group of groups) {
      const id = groups.length === 1 ? artifactId : `${artifactId}@${group[0].status.location}`;
      items.push(buildItem({ project, marketplace, ref: status.ref, lock, out, id, group }));
    }
  }
  const plan = {
    project,
    marketplace,
    out: path.resolve(out),
    ref: status.ref,
    head: status.head,
    ids: items.map((item) => item.id),
    conflicts: items.reduce((sum, item) => sum + item.files.filter((file) => file.result === "conflict").length, 0),
    modified: items.filter((item) => item.state === "modified").length,
    items,
  };
  const text = `${JSON.stringify(plan, null, 2)}\n`;
  fs.mkdirSync(path.dirname(path.resolve(planFile)), { recursive: true });
  fs.writeFileSync(planFile, text);
  fs.writeFileSync(path.join(out, AGENT_PLAN_FILE), text);
  return plan;
}

/** The plan prepare wrote to `planFile`. */
function readPlan(planFile) {
  return JSON.parse(fs.readFileSync(planFile, "utf8"));
}

/** The relative paths of every file under `root`, in path order, with `/` separators. */
function listFiles(root, base = root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

/** True when `target` is `root` or inside it. */
function isInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

/** The text of the proposed files of an item folder: no adapter files and no `resolution.json`; an agent has its one file. */
function proposedFiles(item) {
  const files = new Map();
  for (const name of listFiles(item.dir)) {
    if (!isAdapterFile(name) && name !== RESOLUTION_FILE) {
      files.set(name, fs.readFileSync(path.join(item.dir, name), "utf8"));
    }
  }
  if (item.kind === "agent") {
    const file = `${item.name}.md`;
    if (!files.has(file)) {
      throw new Error(`The proposed copy of ${item.id} has no ${file}`);
    }
    return new Map([[file, files.get(file)]]);
  }
  return files;
}

/** True when `id` is exactly the id prepare gives the item: `kind:name`, or `kind:name@location` for its one location. */
function isItemId(item) {
  const artifactId = `${item.kind}:${item.name}`;
  const locations = Array.isArray(item.locations) ? item.locations : [];
  return item.id === artifactId || (locations.length === 1 && item.id === `${artifactId}@${locations[0]}`);
}

/** An item of the plan, checked: its id, kind, name, locations and folder cannot reach outside the project or the work directory. */
function loadItem(project, out, item) {
  const kindOk = item.kind === "skill" || item.kind === "agent";
  if (!kindOk || !isArtifactId(`${item.kind}:${item.name}`) || !isItemId(item)) {
    throw new Error(`The plan holds an invalid item: ${item.id}`);
  }
  if (typeof item.dir !== "string" || !isInside(out, item.dir) || path.resolve(item.dir) === path.resolve(out)) {
    throw new Error(`The folder of ${item.id} is outside the work directory`);
  }
  const locations = Array.isArray(item.locations) ? item.locations : [];
  const targets = locations.map((location) => (typeof location === "string" ? copyAtLocation(project, item.kind, item.name, location)?.target : undefined));
  if (targets.length === 0 || targets.some((target) => target === undefined)) {
    throw new Error(`The plan holds an invalid location for ${item.id}`);
  }
  const files = proposedFiles(item);
  const portable = new Map([...files].map(([name, text]) => [name, portableText(item.kind, text)]));
  return { item, lockId: `${item.kind}:${item.name}`, files, hash: hashFiles(portable).hash, targets: locations.map((location, index) => ({ location, target: targets[index] })) };
}

/** The conflicted files of an item that still hold the markers `prepare` wrote. */
function unresolvedFiles(loaded) {
  return loaded.item.files.filter((file) => file.result === "conflict" && CONFLICT_MARKER.test(loaded.files.get(file.path) ?? "")).map((file) => file.path);
}

/**
 * What changed in an item folder since prepare, besides the conflicted files (the agent's job) and `resolution.json`:
 * `changed` lists proposed files whose bytes differ or that are gone, `extra` the files prepare did not write.
 */
function driftOf(item) {
  const conflicted = new Set(item.files.filter((file) => file.result === "conflict").map((file) => file.path));
  const expected = item.proposedHashes && typeof item.proposedHashes === "object" ? item.proposedHashes : {};
  const actual = fileHashes(item.dir);
  const changed = Object.keys(expected).filter((name) => !conflicted.has(name) && actual[name] !== expected[name]);
  const extra = Object.keys(actual).filter((name) => name !== RESOLUTION_FILE && !conflicted.has(name) && !Object.hasOwn(expected, name));
  return { changed: changed.sort(), extra: extra.sort() };
}

/** The locations of an item whose project copy differs from the copy prepare merged. */
function changedLocations(project, item) {
  const recorded = item.projectHashes && typeof item.projectHashes === "object" ? item.projectHashes : {};
  return item.locations.filter((location) => !Object.hasOwn(recorded, location) || locationHash(project, item.kind, item.name, location) !== recorded[location]);
}

/** Why apply refuses one loaded item, one reason per problem; empty when it may be written. */
function refusalsOf(project, loaded) {
  const listed = (label, names) => (names.length > 0 ? [`${label}: ${names.join(", ")}`] : []);
  const drift = driftOf(loaded.item);
  return [
    ...listed("Conflict markers remain", unresolvedFiles(loaded)),
    ...listed("No resolution covers", unexplainedFiles(loaded.item)),
    ...listed("Proposed files changed outside the conflicts", drift.changed),
    ...listed("Files not in the plan", drift.extra),
    ...listed("The copy changed in the project after prepare", changedLocations(project, loaded.item)),
  ];
}

/** The `resolution.json` an agent wrote into an item folder, or null when it is missing or unreadable. */
function readResolution(item) {
  try {
    const resolution = JSON.parse(fs.readFileSync(path.join(item.dir, RESOLUTION_FILE), "utf8"));
    return resolution && typeof resolution === "object" ? resolution : null;
  } catch {
    return null;
  }
}

/** The hunks of a resolution that name a file, or an empty list. */
function hunksOf(resolution) {
  return Array.isArray(resolution?.hunks) ? resolution.hunks.filter((hunk) => hunk && typeof hunk.file === "string") : [];
}

/** The conflicted files of an item that `<item.dir>/resolution.json` does not name in `hunks[].file`; all of them without a readable resolution. */
function unexplainedFiles(item) {
  const named = hunksOf(readResolution(item)).map((hunk) => hunk.file);
  return item.files.filter((file) => file.result === "conflict" && !named.includes(file.path)).map((file) => file.path);
}

/** True when the project and the lock already hold the proposed result of an item. */
function isApplied(lock, loaded) {
  const { item, lockId, hash } = loaded;
  const entry = lock && Object.hasOwn(lock, lockId) ? lock[lockId] : null;
  const recorded = entry?.sourceCommit === item.versions.upstreamCommit && `${HASH_PREFIX}${entry.approved}` === hash;
  const written = loaded.targets.every(({ location, target }) => fs.existsSync(target) && copyAt(item.kind, item.name, null, location, target).contentHash === hash);
  return recorded && written;
}

/** Removes `directory` and its parents up to `root` while they are empty. */
function pruneEmpty(directory, root) {
  let current = directory;
  while (current !== path.resolve(root) && isInside(root, current) && fs.readdirSync(current).length === 0) {
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

/** Writes LF `text` to `file` only when its content changes: an existing file keeps CRLF line endings and its mode; a new file gets LF. */
function writeText(file, text) {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return;
  }
  const current = fs.readFileSync(file, "utf8");
  const wanted = CRLF.test(current) ? text.replace(/\r?\n/g, "\r\n") : text;
  if (wanted !== current) {
    const { mode } = fs.statSync(file);
    fs.writeFileSync(file, wanted);
    fs.chmodSync(file, mode);
  }
}

/** Writes the proposed files into one installed copy and removes the portable files the merge removed. */
function writeCopy(loaded, target) {
  if (loaded.item.kind === "agent") {
    writeText(target, loaded.files.get(`${loaded.item.name}.md`));
    return;
  }
  for (const [name, text] of loaded.files) {
    const file = path.resolve(target, name);
    if (!isInside(target, file)) {
      throw new Error(`An artifact file path leaves its folder: ${name}`);
    }
    writeText(file, text);
  }
  for (const name of listFiles(target)) {
    if (!loaded.files.has(name) && !isAdapterFile(name)) {
      fs.rmSync(path.join(target, name));
      pruneEmpty(path.dirname(path.join(target, name)), target);
    }
  }
}

/** Records the new base and the approved hash of a written item; returns true when the result still differs from upstream. */
function recordApplied(project, marketplace, loaded) {
  const { item, lockId, hash } = loaded;
  const lock = readLock(project);
  const previous = lock && Object.hasOwn(lock, lockId) ? lock[lockId] : null;
  const location = item.locations.includes(previous?.location) ? previous.location : item.locations[0];
  const approved = hash.slice(HASH_PREFIX.length);
  const entry = record(project, lockId, { marketplace, baseCommit: item.versions.upstreamCommit, approved, location });
  return entry.hash !== hash;
}

/** The result of one plan item in an apply report. */
function itemResult(selected, written, id) {
  if (!selected.includes(id)) {
    return "not selected";
  }
  return written.includes(id) ? "written" : "already applied";
}

/**
 * Applies the selected items of the plan in `plan` (the file prepare wrote, outside the work directory) to `project`
 * and records their new base in its lock. Refuses a plan prepared for another project or marketplace and an unknown id.
 * Then it checks every selected item that is not applied yet and writes nothing when any of them is refused (see
 * `refusalsOf`), naming each item and why. Then it writes every item, then records every item in the lock.
 * `applied` lists the items written, `skipped` every other item of the plan (not selected, or already applied),
 * `upstream` the written items whose result still differs from the marketplace, and `items` the result per item.
 */
export function apply({ plan: planFile, project, marketplace, selected }) {
  const plan = readPlan(planFile);
  if (path.resolve(String(plan.project)) !== path.resolve(project)) {
    throw new Error("The plan was prepared for another project");
  }
  if (path.resolve(String(plan.marketplace)) !== path.resolve(marketplace)) {
    throw new Error("The plan was prepared for another marketplace checkout");
  }
  const unknown = selected.filter((id) => !plan.ids.includes(id));
  if (unknown.length > 0) {
    throw new Error(`Not in the plan: ${unknown.join(", ")}`);
  }
  const loadedItems = plan.items.filter((item) => selected.includes(item.id)).map((item) => loadItem(project, plan.out, item));
  const lock = readLock(project);
  const pending = loadedItems.filter((candidate) => !isApplied(lock, candidate));
  const refused = pending.map((loaded) => ({ id: loaded.item.id, reasons: refusalsOf(project, loaded) })).filter((entry) => entry.reasons.length > 0);
  if (refused.length > 0) {
    throw new Error(`Nothing was written. ${refused.map((entry) => `${entry.id}: ${entry.reasons.join("; ")}`).join(". ")}`);
  }
  for (const loaded of pending) {
    for (const { target } of loaded.targets) {
      writeCopy(loaded, target);
    }
  }
  const applied = pending.map((loaded) => loaded.item.id);
  const upstream = pending.filter((loaded) => recordApplied(project, marketplace, loaded)).map((loaded) => loaded.item.id);
  return {
    applied,
    skipped: plan.ids.filter((id) => !applied.includes(id)),
    upstream,
    items: plan.ids.map((id) => ({ id, result: itemResult(selected, applied, id), upstream: upstream.includes(id) })),
  };
}

/** A version pair as "local -> upstream"; the short commits are added when the versions cannot tell the sides apart. */
function versionText(versions) {
  const { local, upstream, localCommit, upstreamCommit } = versions;
  if (local && upstream && local !== upstream) {
    return `${local} -> ${upstream}`;
  }
  const short = (commit) => String(commit ?? "").slice(0, SHORT_COMMIT);
  return `${local ?? "?"} (${short(localCommit)}) -> ${upstream ?? "?"} (${short(upstreamCommit)})`;
}

/** The text of a file, line endings normalized, or undefined when it does not exist. */
function readText(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile() ? normalizeText(fs.readFileSync(file, "utf8")) : undefined;
}

/** The project copy of one item file at the item's first location. */
function projectFile(plan, item, name) {
  const target = copyAtLocation(plan.project, item.kind, item.name, item.locations[0])?.target;
  if (!target) {
    return undefined;
  }
  return item.kind === "agent" ? target : path.join(target, ...name.split("/"));
}

/** The diff lines from the project copy of a file to its proposed copy, at most DIFF_LINES of them. */
function resolutionDiff(plan, item, name) {
  const local = readText(projectFile(plan, item, name) ?? "");
  const proposed = readText(path.join(item.dir, ...name.split("/")));
  if (local === undefined || proposed === undefined) {
    return [proposed === undefined ? "the proposed copy removes this file" : "the project has no copy of this file; the proposed copy adds it"];
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-merge-diff-"));
  try {
    fs.writeFileSync(path.join(tempDir, "project"), local);
    fs.writeFileSync(path.join(tempDir, "proposed"), proposed);
    const result = spawnSync("git", ["diff", "--no-index", "--no-color", `-U${DIFF_CONTEXT}`, "project", "proposed"], { cwd: tempDir, encoding: "utf8" });
    const lines = result.stdout.split("\n");
    const body = lines.slice(Math.max(0, lines.findIndex((line) => line.startsWith("@@")))).filter((line) => line !== "");
    const shown = body.slice(0, DIFF_LINES);
    return body.length > DIFF_LINES ? [...shown, `... ${body.length - DIFF_LINES} more lines`] : shown;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** The lines of one conflicted file: its kind, the agent's reason per hunk and the diff of the resolution. */
function conflictLines(plan, item, file, hunks) {
  const lines = [`Conflict in ${file.path} (${file.conflictKind}):`];
  const text = readText(path.join(item.dir, ...file.path.split("/")));
  if (text !== undefined && CONFLICT_MARKER.test(text)) {
    return [...lines, "  - conflict markers remain; apply refuses this item"];
  }
  const own = hunks.filter((hunk) => hunk.file === file.path);
  if (own.length === 0) {
    lines.push("  - no resolution yet; apply refuses this item");
  }
  for (const hunk of own) {
    lines.push(`  - ${String(hunk.reason ?? "no reason given")}${hunk.sure === true ? "" : " (unsure)"}`);
  }
  return [...lines, ...resolutionDiff(plan, item, file.path).map((line) => `    ${line}`)];
}

/** The lines that say what would go upstream as a draft PR. */
function upstreamLines(item, resolution) {
  if (item.state !== "modified") {
    return ["Upstream: nothing to send (no local change)."];
  }
  const upstream = resolution?.upstream;
  if (!upstream || typeof upstream !== "object") {
    return ["Upstream: not classified yet; the upstream flow classifies the change before any draft PR."];
  }
  const portable = Array.isArray(upstream.portable) ? upstream.portable.map(String) : [];
  const adapter = Array.isArray(upstream.adapter) ? upstream.adapter.map(String) : [];
  return [
    portable.length > 0 ? `Upstream draft PR: ${portable.join("; ")}` : "Upstream: nothing portable; the change stays in the project.",
    ...(adapter.length > 0 ? [`Stays in the project: ${adapter.join("; ")}`] : []),
  ];
}

/** The lines that say which files changed in the item folder outside the conflicts since prepare. */
function driftLines(drift) {
  return [
    ...(drift.changed.length > 0 ? [`Changed outside the conflicts: ${drift.changed.join(", ")}; apply refuses this item.`] : []),
    ...(drift.extra.length > 0 ? [`Not in the plan: ${drift.extra.join(", ")}; apply refuses this item.`] : []),
  ];
}

/** One row of the merge question for a plan item. */
function summaryRow(plan, item) {
  if (typeof item.dir !== "string" || !isInside(plan.out, item.dir)) {
    throw new Error(`The folder of ${item.id} is outside the work directory`);
  }
  const resolution = readResolution(item);
  const hunks = hunksOf(resolution);
  const conflicts = item.files.filter((file) => file.result === "conflict");
  const clean = item.files.filter((file) => file.result !== "conflict");
  const unresolved = conflicts.some((file) => CONFLICT_MARKER.test(readText(path.join(item.dir, ...file.path.split("/"))) ?? ""));
  const location = item.id.includes("@") ? ` at ${item.locations.join(", ")}` : "";
  const drift = driftOf(item);
  const drifted = drift.changed.length > 0 || drift.extra.length > 0;
  const detail = [
    ...driftLines(drift),
    ...(item.baseGuessed ? ["Base guessed: the project lock does not record which marketplace version this copy came from."] : []),
    ...(clean.length > 0 ? [`Merged cleanly: ${clean.map((file) => `${file.path} (${file.result})`).join(", ")}`] : []),
    ...conflicts.flatMap((file) => conflictLines(plan, item, file, hunks)),
    ...upstreamLines(item, resolution),
  ];
  const classified = item.state !== "modified" || (resolution?.upstream !== null && typeof resolution?.upstream === "object");
  const sure = classified && hunks.every((hunk) => hunk.sure === true);
  return {
    id: item.id,
    label: `${item.kind} ${item.name}${location} (${item.state}) ${versionText(item.versions)}`,
    detail: detail.join("\n"),
    checked: !item.baseGuessed && !unresolved && !drifted && unexplainedFiles(item).length === 0 && sure,
  };
}

/**
 * The rows of the one merge question for the plan in `plan` (the file prepare wrote): per item a label (kind, name,
 * state, versions), a detail (files changed outside the conflicts, clean files, conflicts with the agent's reason per
 * hunk and the resolution diff, the upstream part) and whether it is checked by default (a known base, every conflict
 * resolved and explained, every hunk sure, no file changed outside the conflicts and a modified item classified). Reads only.
 */
export function summary({ plan: planFile }) {
  const plan = readPlan(planFile);
  return { ids: plan.ids, items: plan.items.map((item) => summaryRow(plan, item)) };
}

function requireFlag(options, key, flag) {
  if (!options[key]) {
    throw new Error(`Missing ${flag}`);
  }
  return path.resolve(options[key]);
}

function runPrepare(rest) {
  const options = parseFlags(rest, { values: { "--project": "project", "--marketplace": "marketplace", "--out": "out", "--plan": "plan" }, switches: { "--no-fetch": "noFetch", "--json": "json" } });
  const project = requireFlag(options, "project", "--project");
  const marketplace = requireFlag(options, "marketplace", "--marketplace");
  const out = requireFlag(options, "out", "--out");
  const plan = prepare({
    project,
    marketplace,
    out,
    plan: options.plan ? path.resolve(options.plan) : defaultPlanFile(out),
    fetch: !options.noFetch,
  });
  return { result: plan, json: options.json };
}

function runApply(rest) {
  const options = parseFlags(rest, { values: { "--plan": "plan", "--project": "project", "--marketplace": "marketplace", "--selected": "selected" }, switches: { "--json": "json" } });
  if (!options.selected) {
    throw new Error("Missing --selected <id,id,...|none>");
  }
  const selected = options.selected === NONE ? [] : [...new Set(options.selected.split(",").filter(Boolean))];
  const result = apply({
    plan: requireFlag(options, "plan", "--plan"),
    project: requireFlag(options, "project", "--project"),
    marketplace: requireFlag(options, "marketplace", "--marketplace"),
    selected,
  });
  return { result, json: options.json };
}

function runSummary(rest) {
  const options = parseFlags(rest, { values: { "--plan": "plan" }, switches: { "--json": "json" } });
  return { result: summary({ plan: requireFlag(options, "plan", "--plan") }), json: options.json };
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const commands = { [PREPARE]: runPrepare, [SUMMARY]: runSummary, [APPLY]: runApply };
  if (!Object.hasOwn(commands, command ?? "")) {
    throw new Error(`Unknown command: ${command}. Use ${PREPARE}, ${SUMMARY} or ${APPLY}.`);
  }
  const { result, json } = commands[command](rest);
  console.log(json ? JSON.stringify(result, null, 2) : JSON.stringify(result));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
