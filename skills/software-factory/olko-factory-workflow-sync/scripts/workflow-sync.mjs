/**
 * Script commands of the factory workflow sync loop: `scan`, `round`, `diff` and `finish` (see SKILL.md).
 *
 * The factory work runs through two factory entry points, the `sources:lock` and `workflows:validate`
 * scripts of `<factory>/package.json`, so this skill does not depend on the factory source layout.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** The marketplace checkout this script sits in when it runs from `skills/<category>/<skill>/scripts/`. */
const ENCLOSING_CHECKOUT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");
const ERROR_EXIT = 2;
const OUTPUT_MAX_BUFFER = 32 * 1024 * 1024;
/** How many validator lines `round` returns. */
const MAX_VALIDATOR_LINES = 20;
/** Length of a short commit id in messages. */
const SHORT_COMMIT = 7;
/** Flags that may be given more than once; their values are collected in a list. */
const REPEATABLE_FLAGS = new Set(["needs-op", "only"]);
const DECISIONS = ["approve", "revert", "none"];
/** The factory entry points: scripts of `<factory>/package.json` of the form `node <file>`. */
const FACTORY_SCRIPTS = { lock: "sources:lock", validate: "workflows:validate" };
const NO_FACTORY_HINT = "pass --factory <factory folder of the marketplace checkout>";
const OPEN_RESULT = () => ({ verdict: "open", needsOp: [], engineGaps: 0 });

function fail(message) {
  console.error(message);
  process.exit(ERROR_EXIT);
}

/** The command and its `--name value` flags; a flag without a value is "true", repeatable flags are lists. */
function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const argument = rest[i];
    if (!argument.startsWith("--")) {
      fail(`unexpected argument ${argument}`);
    }
    const name = argument.slice(2);
    const value = rest[i + 1] !== undefined && !rest[i + 1].startsWith("--") ? rest[(i += 1)] : "true";
    if (REPEATABLE_FLAGS.has(name)) {
      (flags[name] ??= []).push(value);
    } else {
      flags[name] = value;
    }
  }
  return { command, flags };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Runs git in `cwd` and returns its trimmed output; throws when git fails. */
function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: OUTPUT_MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * The marketplace checkout and factory folder: the flags, else the checkout this script sits in and
 * its `factory` folder. An installed copy of the skill is not inside a checkout (no registry.json
 * there), so it uses `FACTORY_MARKETPLACE_DIR` (and `FACTORY_DIR`, else `<marketplace>/factory`) and
 * fails without a marketplace.
 */
export function resolveCheckout(flags, env = process.env, enclosing = ENCLOSING_CHECKOUT) {
  const inside = fs.existsSync(path.join(enclosing, "registry.json"));
  const marketplace = flags.marketplace ?? (inside ? enclosing : env.FACTORY_MARKETPLACE_DIR);
  if (!marketplace) {
    throw new Error("this script is not inside a marketplace checkout; pass --marketplace <checkout> (and --factory <folder>) or set FACTORY_MARKETPLACE_DIR");
  }
  const factory = flags.factory ?? (inside ? path.join(enclosing, "factory") : env.FACTORY_DIR ?? path.join(marketplace, "factory"));
  return { marketplace: path.resolve(marketplace), factory: path.resolve(factory) };
}

/** The file a factory entry point runs: the `node <file>` command of a `<factory>/package.json` script. */
function factoryEntry(factory, script) {
  const manifest = path.join(factory, "package.json");
  if (!fs.existsSync(manifest)) {
    fail(`${manifest} does not exist; ${NO_FACTORY_HINT}`);
  }
  const command = readJson(manifest).scripts?.[script] ?? "";
  const match = command.match(/^node (\S+)$/);
  if (!match) {
    fail(`${manifest} has no "${script}" script of the form "node <file>"; ${NO_FACTORY_HINT}`);
  }
  const file = path.join(factory, match[1]);
  if (!fs.existsSync(file)) {
    fail(`${file} does not exist; ${NO_FACTORY_HINT}`);
  }
  return file;
}

function factoryCli(factory, script, args) {
  return execFileSync(process.execPath, [factoryEntry(factory, script), ...args], { encoding: "utf8", maxBuffer: OUTPUT_MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"] });
}

function validate(sync) {
  try {
    factoryCli(sync.factory, FACTORY_SCRIPTS.validate, [sync.workflows]);
    return { valid: true, errors: [] };
  } catch (error) {
    return { valid: false, errors: String(error.stderr ?? error.message).split(/\r?\n/).filter(Boolean).slice(0, MAX_VALIDATOR_LINES) };
  }
}

function yamlFiles(dir) {
  return fs.readdirSync(dir).filter((file) => file.endsWith(".yaml")).sort();
}

export function workflowGraph(dir) {
  return yamlFiles(dir).map((file) => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const name = text.match(/^name:\s*["']?([a-z0-9-]+)/m)?.[1] ?? file.replace(/\.yaml$/, "");
    return { name, children: [...text.matchAll(/\bworkflow:\s*["']?([a-z0-9-]+)/g)].map((match) => match[1]) };
  });
}

/** Every workflow reachable from a root workflow, the root included. */
function reachableFrom(children, root) {
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    for (const child of children.get(name) ?? []) {
      visit(child);
    }
  };
  visit(root);
  return seen;
}

/** The named workflows plus every workflow of each root workflow tree that contains one of them. */
export function workflowFamily(graph, names) {
  const children = new Map(graph.map((workflow) => [workflow.name, workflow.children]));
  const referenced = new Set([...children.values()].flat());
  const family = new Set(names);
  for (const root of graph.map((workflow) => workflow.name).filter((name) => !referenced.has(name))) {
    const members = reachableFrom(children, root);
    if (names.some((name) => members.has(name))) {
      for (const member of members) {
        family.add(member);
      }
    }
  }
  return [...family].sort();
}

function diffOf(marketplace, commit, file) {
  const short = commit.slice(0, SHORT_COMMIT);
  try {
    return git(marketplace, "diff", commit, "HEAD", "--", file) || `(no textual diff between ${short} and HEAD)`;
  } catch {
    const current = path.join(marketplace, file);
    return `(commit ${short} is not in ${marketplace}; full current text follows)\n${fs.existsSync(current) ? fs.readFileSync(current, "utf8") : ""}`;
  }
}

function copyYaml(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const file of yamlFiles(from)) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
}

function loadSync(flags) {
  if (!flags["state-dir"]) {
    fail("--state-dir is required");
  }
  const file = path.join(flags["state-dir"], "sync.json");
  if (!fs.existsSync(file)) {
    fail(`${file} does not exist; run scan first`);
  }
  return { file, sync: readJson(file) };
}

function recordLast(sync, flags) {
  if (!flags["last-verdict"] || !sync.lastSource) {
    return;
  }
  const result = (sync.results[sync.lastSource] ??= OPEN_RESULT());
  result.verdict = flags["last-verdict"].toLowerCase() === "pass" ? "pass" : "open";
  result.engineGaps = Number(flags["last-engine-gaps"] ?? 0) || 0;
}

/** The skill or agent name of a marketplace source path: `agents/<harness>/<name>.md` or `skills/<category>/<name>/...`. */
export function artifactName(source) {
  const parts = source.split("/");
  if (parts[0] === "skills" && parts.length >= 3) {
    return parts[2];
  }
  return path.posix.basename(source).replace(/\.md$/, "");
}

/** One item per stale source (changed or missing) with the workflows that lock it, plus one per new main agent. */
function groupBySource(found, marketplace) {
  const bySource = new Map();
  for (const stale of found.stale) {
    for (const [kind, files] of [["changed", stale.changed], ["missing", stale.missing]]) {
      for (const source of files) {
        const item = bySource.get(source) ?? { kind, source, commit: stale.commit, workflows: [] };
        item.workflows.push(stale.workflow);
        bySource.set(source, item);
      }
    }
  }
  const items = [...bySource.values()].map((item) => ({ ...item, diff: item.kind === "missing" ? `${item.source} was removed from the marketplace` : diffOf(marketplace, item.commit, item.source) }));
  for (const agent of found.unmapped) {
    items.push({ kind: "new", source: agent.file, commit: found.head, workflows: [], diff: fs.readFileSync(path.join(marketplace, agent.file), "utf8") });
  }
  return items;
}

/** The items whose skill or agent name is in `--only` (repeatable or comma-separated); all items without it. */
function selectItems(items, only) {
  if (!only) {
    return items;
  }
  const names = new Set(only.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean));
  return items.filter((item) => names.has(artifactName(item.source)));
}

/** Writes `items/<n>.diff` and `items/<n>.json` for each item into a fresh items folder and returns the item list. */
function writeItems(selected, { stateDir, workflows, graph }) {
  fs.rmSync(path.join(stateDir, "items"), { recursive: true, force: true });
  fs.rmSync(path.join(stateDir, "snapshot"), { recursive: true, force: true });
  fs.mkdirSync(path.join(stateDir, "items"), { recursive: true });
  const yamlPath = (workflow) => path.join(workflows, `${workflow}.yaml`);
  return selected.map((item, index) => {
    const n = index + 1;
    const diffFile = path.join(stateDir, "items", `${n}.diff`);
    fs.writeFileSync(diffFile, item.diff);
    const detail = {
      n,
      kind: item.kind,
      source: item.source,
      commit: item.commit,
      yamlFiles: item.workflows.map(yamlPath),
      family: workflowFamily(graph, item.workflows).map(yamlPath),
      diffFile,
    };
    const itemFile = path.join(stateDir, "items", `${n}.json`);
    writeJson(itemFile, detail);
    return { n, kind: item.kind, source: item.source, ask: item.kind === "new", itemFile };
  });
}

function scan(flags) {
  let checkout;
  try {
    checkout = resolveCheckout(flags);
  } catch (error) {
    fail(error.message);
  }
  const { marketplace, factory } = checkout;
  const workflows = path.resolve(flags.workflows ?? path.join(factory, "workflows"));
  const stateDir = path.resolve(flags["state-dir"] ?? fs.mkdtempSync(path.join(os.tmpdir(), "workflow-sync-")));
  const found = JSON.parse(factoryCli(factory, FACTORY_SCRIPTS.lock, ["scan", "--workflows", workflows, "--marketplace", marketplace]));
  const selected = selectItems(groupBySource(found, marketplace), flags.only);
  const items = writeItems(selected, { stateDir, workflows, graph: workflowGraph(workflows) });
  copyYaml(workflows, path.join(stateDir, "snapshot"));
  const lines = [
    ...items.map((item) => `${item.kind} ${item.source}`),
    ...found.unlocked.map((workflow) => `unlocked ${workflow}: not in the lock`),
    ...found.broken.map((broken) => `broken ${broken.workflow}#${broken.node}: ${broken.name} is not in the marketplace`),
  ];
  const sync = { marketplace, factory, workflows, head: found.head, unlocked: found.unlocked, broken: found.broken, items, rounds: {}, results: {}, lastSource: null };
  writeJson(path.join(stateDir, "sync.json"), sync);
  return { stateDir, workflows, marketplace, factory, head: found.head, items, pending: items.length + found.unlocked.length, summary: lines.join("; ") || "every workflow matches its sources" };
}

function round(flags) {
  const { file, sync } = loadSync(flags);
  const source = flags.source;
  if (!source) {
    fail("--source is required");
  }
  recordLast(sync, flags);
  sync.rounds[source] = (sync.rounds[source] ?? 0) + 1;
  const result = (sync.results[source] ??= OPEN_RESULT());
  result.verdict = "open";
  result.needsOp = [...new Set([...result.needsOp, ...(flags["needs-op"] ?? [])])];
  sync.lastSource = source;
  writeJson(file, sync);
  const check = validate(sync);
  return { source, round: sync.rounds[source], valid: check.valid, errors: check.errors };
}

function yamlDiff(sync, stateDir, stat) {
  try {
    execFileSync("git", ["-c", "core.autocrlf=false", "diff", "--no-index", ...(stat ? ["--stat"] : []), path.join(stateDir, "snapshot"), sync.workflows], { encoding: "utf8", maxBuffer: OUTPUT_MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"] });
    return "";
  } catch (error) {
    const output = String(error.stdout ?? "");
    if (error.status === 1 && output.trim()) {
      return output;
    }
    throw error;
  }
}

function diff(flags) {
  const { file, sync } = loadSync(flags);
  recordLast(sync, flags);
  writeJson(file, sync);
  const stateDir = flags["state-dir"];
  const statLines = yamlDiff(sync, stateDir, true);
  const stat = statLines.trim();
  const diffFile = path.join(stateDir, "workflows.diff");
  fs.writeFileSync(diffFile, yamlDiff(sync, stateDir, false));
  const needsOp = Object.entries(sync.results).flatMap(([source, result]) => [...result.needsOp.map((line) => `${source}: ${line}`), ...(result.engineGaps ? [`${source}: ${result.engineGaps} engine gaps from the verifier`] : [])]);
  const open = Object.entries(sync.results).filter(([, result]) => result.verdict !== "pass").map(([source]) => source);
  return { stat: stat || "no YAML changed", changed: (statLines.match(/^ \S.*\|/gm) ?? []).length, diffFile, needsOp: needsOp.join("\n") || "none", open: open.join("\n") || "none" };
}

function restore(sync, stateDir) {
  const snapshot = path.join(stateDir, "snapshot");
  for (const file of yamlFiles(sync.workflows)) {
    if (!fs.existsSync(path.join(snapshot, file))) {
      fs.rmSync(path.join(sync.workflows, file));
    }
  }
  copyYaml(snapshot, sync.workflows);
}

/** The workflows to lock on approve: those missing from the lock, plus the workflows of every source with a pass verdict. */
function lockedNames(sync, passed) {
  const ofSource = (source) => sync.items.filter((item) => item.source === source).flatMap((item) => readJson(item.itemFile).yamlFiles.map((file) => path.basename(file, ".yaml")));
  return [...new Set([...sync.unlocked, ...passed.flatMap(ofSource)])];
}

/** The last report line per decision; approve depends on whether anything was locked. */
const DECISION_LINES = {
  approve: ({ names, locked }) => (names.length ? `Lock updated: ${locked.join(", ") || "none"}` : "Lock unchanged: no source has a pass verdict and no workflow is missing from the lock"),
  revert: () => "Reverted: no YAML or lock change kept",
  none: () => "Lock unchanged",
};

function itemLine(sync, item) {
  const result = sync.results[item.source];
  if (!result) {
    return `${item.source}: skipped`;
  }
  const work = [...result.needsOp, ...(result.engineGaps ? [`${result.engineGaps} engine gaps`] : [])];
  return `${item.source}: ${result.verdict}${work.length ? `; needs engine work: ${work.join(" | ")}` : ""}`;
}

function buildReport(sync, decision, { names, locked }) {
  const found = sync.items.map((item) => `${item.kind} ${item.source}`).join("; ") || "no changed source";
  const unlocked = sync.unlocked.length ? `; unlocked: ${sync.unlocked.join(", ")}` : "";
  return [
    `Marketplace ${sync.head.slice(0, SHORT_COMMIT)}`,
    `Found: ${found}${unlocked}`,
    ...sync.items.map((item) => itemLine(sync, item)),
    DECISION_LINES[decision]({ names, locked }),
  ].join("\n");
}

function approve(sync) {
  const check = validate(sync);
  if (!check.valid) {
    fail(`approve refused: the workflows are invalid\n${check.errors.join("\n")}`);
  }
  const passed = Object.entries(sync.results).filter(([, result]) => result.verdict === "pass").map(([source]) => source);
  const names = lockedNames(sync, passed);
  if (!names.length) {
    return { names, locked: [] };
  }
  const out = factoryCli(sync.factory, FACTORY_SCRIPTS.lock, ["lock", "--workflows", sync.workflows, "--marketplace", sync.marketplace, "--commit", sync.head, "--names", names.join(","), "--sources", passed.join(",")]);
  return { names, locked: JSON.parse(out).locked };
}

function finish(flags) {
  const { sync } = loadSync(flags);
  const decision = flags.decision ?? "none";
  if (!DECISIONS.includes(decision)) {
    fail("--decision must be approve, revert or none");
  }
  let outcome = { names: [], locked: [] };
  if (decision === "approve") {
    outcome = approve(sync);
  }
  if (decision === "revert") {
    restore(sync, flags["state-dir"]);
  }
  return { decision, locked: outcome.locked, report: buildReport(sync, decision, outcome) };
}

const COMMANDS = { scan, round, diff, finish };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const run = COMMANDS[command];
  if (!run) {
    fail(`usage: workflow-sync.mjs <${Object.keys(COMMANDS).join("|")}> [--flags]`);
  }
  console.log(JSON.stringify(run(flags)));
}
