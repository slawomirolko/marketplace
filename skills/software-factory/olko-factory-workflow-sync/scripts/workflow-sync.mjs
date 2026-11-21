import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHECKOUT = path.resolve(SCRIPT_DIR, "..", "..", "..", "..");

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) fail(`unexpected argument ${arg}`);
    const name = arg.slice(2);
    const value = rest[i + 1] !== undefined && !rest[i + 1].startsWith("--") ? rest[(i += 1)] : "true";
    if (name === "needs-op" || name === "only") (flags[name] ??= []).push(value);
    else flags[name] = value;
  }
  return { command, flags };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function factoryCli(factory, script, args) {
  const file = path.join(factory, "src", script);
  if (!fs.existsSync(file)) fail(`${file} does not exist; pass --factory <factory folder of the marketplace checkout>`);
  return execFileSync(process.execPath, [file, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function validate(sync) {
  try {
    factoryCli(sync.factory, "validate-workflows.ts", [sync.workflows]);
    return { valid: true, errors: [] };
  } catch (error) {
    return { valid: false, errors: String(error.stderr ?? error.message).split(/\r?\n/).filter(Boolean).slice(0, 20) };
  }
}

function yamlFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
}

export function workflowGraph(dir) {
  return yamlFiles(dir).map((file) => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const name = text.match(/^name:\s*["']?([a-z0-9-]+)/m)?.[1] ?? file.replace(/\.yaml$/, "");
    return { name, children: [...text.matchAll(/\bworkflow:\s*["']?([a-z0-9-]+)/g)].map((m) => m[1]) };
  });
}

export function workflowFamily(graph, names) {
  const children = new Map(graph.map((w) => [w.name, w.children]));
  const below = (root) => {
    const seen = new Set();
    const visit = (name) => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const child of children.get(name) ?? []) visit(child);
    };
    visit(root);
    return seen;
  };
  const referenced = new Set([...children.values()].flat());
  const family = new Set(names);
  for (const root of graph.map((w) => w.name).filter((n) => !referenced.has(n))) {
    const members = below(root);
    if (names.some((n) => members.has(n))) for (const m of members) family.add(m);
  }
  return [...family].sort();
}

function diffOf(marketplace, commit, file) {
  try {
    return git(marketplace, "diff", commit, "HEAD", "--", file) || `(no textual diff between ${commit.slice(0, 7)} and HEAD)`;
  } catch {
    const current = path.join(marketplace, file);
    return `(commit ${commit.slice(0, 7)} is not in ${marketplace}; full current text follows)\n${fs.existsSync(current) ? fs.readFileSync(current, "utf8") : ""}`;
  }
}

function copyYaml(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of yamlFiles(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
}

function loadSync(flags) {
  if (!flags["state-dir"]) fail("--state-dir is required");
  const file = path.join(flags["state-dir"], "sync.json");
  if (!fs.existsSync(file)) fail(`${file} does not exist; run scan first`);
  return { file, sync: readJson(file) };
}

function recordLast(sync, flags) {
  if (!flags["last-verdict"] || !sync.lastSource) return;
  const result = (sync.results[sync.lastSource] ??= { verdict: "open", needsOp: [], engineGaps: 0 });
  result.verdict = flags["last-verdict"].toLowerCase() === "pass" ? "pass" : "open";
  result.engineGaps = Number(flags["last-engine-gaps"] ?? 0) || 0;
}

/** The skill or agent name of a marketplace source path: `agents/<harness>/<name>.md` or `skills/<category>/<name>/...`. */
export function artifactName(source) {
  const parts = source.split("/");
  if (parts[0] === "skills" && parts.length >= 3) return parts[2];
  return path.posix.basename(source).replace(/\.md$/, "");
}

function scan(flags) {
  const marketplace = path.resolve(flags.marketplace ?? CHECKOUT);
  const factory = path.resolve(flags.factory ?? path.join(CHECKOUT, "factory"));
  const workflows = path.resolve(flags.workflows ?? path.join(factory, "workflows"));
  const stateDir = path.resolve(flags["state-dir"] ?? fs.mkdtempSync(path.join(os.tmpdir(), "workflow-sync-")));
  const found = JSON.parse(factoryCli(factory, "sources-lock.ts", ["scan", "--workflows", workflows, "--marketplace", marketplace]));
  const graph = workflowGraph(workflows);
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
  const raw = [...bySource.values()].map((item) => ({ ...item, diff: item.kind === "missing" ? `${item.source} was removed from the marketplace` : diffOf(marketplace, item.commit, item.source) }));
  for (const agent of found.unmapped) raw.push({ kind: "new", source: agent.file, commit: found.head, workflows: [], diff: fs.readFileSync(path.join(marketplace, agent.file), "utf8") });
  const only = flags.only ? new Set(flags.only.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean)) : null;
  const selected = only ? raw.filter((item) => only.has(artifactName(item.source))) : raw;
  fs.mkdirSync(path.join(stateDir, "items"), { recursive: true });
  const items = selected.map((item, index) => {
    const n = index + 1;
    const diffFile = path.join(stateDir, "items", `${n}.diff`);
    fs.writeFileSync(diffFile, item.diff);
    const detail = {
      n,
      kind: item.kind,
      source: item.source,
      commit: item.commit,
      yamlFiles: item.workflows.map((w) => path.join(workflows, `${w}.yaml`)),
      family: workflowFamily(graph, item.workflows).map((w) => path.join(workflows, `${w}.yaml`)),
      diffFile,
    };
    const itemFile = path.join(stateDir, "items", `${n}.json`);
    writeJson(itemFile, detail);
    return { n, kind: item.kind, source: item.source, ask: item.kind === "new", itemFile };
  });
  copyYaml(workflows, path.join(stateDir, "snapshot"));
  const lines = [
    ...items.map((i) => `${i.kind} ${i.source}`),
    ...found.unlocked.map((w) => `unlocked ${w}: not in the lock`),
    ...found.broken.map((b) => `broken ${b.workflow}#${b.node}: ${b.name} is not in the marketplace`),
  ];
  const sync = { marketplace, factory, workflows, head: found.head, unlocked: found.unlocked, broken: found.broken, items, rounds: {}, results: {}, lastSource: null };
  writeJson(path.join(stateDir, "sync.json"), sync);
  return { stateDir, workflows, marketplace, factory, head: found.head, items, pending: items.length + found.unlocked.length, summary: lines.join("; ") || "every workflow matches its sources" };
}

function round(flags) {
  const { file, sync } = loadSync(flags);
  const source = flags.source;
  if (!source) fail("--source is required");
  recordLast(sync, flags);
  sync.rounds[source] = (sync.rounds[source] ?? 0) + 1;
  const result = (sync.results[source] ??= { verdict: "open", needsOp: [], engineGaps: 0 });
  result.verdict = "open";
  result.needsOp = [...new Set([...result.needsOp, ...(flags["needs-op"] ?? [])])];
  sync.lastSource = source;
  writeJson(file, sync);
  const check = validate(sync);
  return { source, round: sync.rounds[source], valid: check.valid, errors: check.errors };
}

function yamlDiff(sync, stateDir, stat) {
  try {
    execFileSync("git", ["-c", "core.autocrlf=false", "diff", "--no-index", ...(stat ? ["--stat"] : []), path.join(stateDir, "snapshot"), sync.workflows], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return "";
  } catch (error) {
    return String(error.stdout ?? "");
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
  const needsOp = Object.entries(sync.results).flatMap(([source, r]) => [...r.needsOp.map((n) => `${source}: ${n}`), ...(r.engineGaps ? [`${source}: ${r.engineGaps} engine gaps from the verifier`] : [])]);
  const open = Object.entries(sync.results).filter(([, r]) => r.verdict !== "pass").map(([source]) => source);
  return { stat: stat || "no YAML changed", changed: (statLines.match(/^ \S.*\|/gm) ?? []).length, diffFile, needsOp: needsOp.join("\n") || "none", open: open.join("\n") || "none" };
}

function restore(sync, stateDir) {
  const snapshot = path.join(stateDir, "snapshot");
  for (const f of yamlFiles(sync.workflows)) if (!fs.existsSync(path.join(snapshot, f))) fs.rmSync(path.join(sync.workflows, f));
  copyYaml(snapshot, sync.workflows);
}

function finish(flags) {
  const { sync } = loadSync(flags);
  const decision = flags.decision ?? "none";
  if (!["approve", "revert", "none"].includes(decision)) fail("--decision must be approve, revert or none");
  const passed = Object.entries(sync.results).filter(([, r]) => r.verdict === "pass").map(([source]) => source);
  let locked = [];
  if (decision === "approve") {
    const names = [...sync.unlocked, ...passed.flatMap((source) => sync.items.filter((i) => i.source === source).flatMap((i) => readJson(i.itemFile).yamlFiles.map((f) => path.basename(f, ".yaml"))))];
    const out = factoryCli(sync.factory, "sources-lock.ts", ["lock", "--workflows", sync.workflows, "--marketplace", sync.marketplace, "--commit", sync.head, "--names", [...new Set(names)].join(","), "--sources", passed.join(",")]);
    locked = JSON.parse(out).locked;
  }
  if (decision === "revert") restore(sync, flags["state-dir"]);
  const lines = [
    `Marketplace ${sync.head.slice(0, 7)}`,
    `Found: ${sync.items.map((i) => `${i.kind} ${i.source}`).join("; ") || "no changed source"}${sync.unlocked.length ? `; unlocked: ${sync.unlocked.join(", ")}` : ""}`,
    ...sync.items.map((i) => {
      const r = sync.results[i.source];
      if (!r) return `${i.source}: skipped`;
      const work = [...r.needsOp, ...(r.engineGaps ? [`${r.engineGaps} engine gaps`] : [])];
      return `${i.source}: ${r.verdict}${work.length ? `; needs engine work: ${work.join(" | ")}` : ""}`;
    }),
    decision === "approve" ? `Lock updated: ${locked.join(", ") || "none"}` : decision === "revert" ? "Reverted: no YAML or lock change kept" : "Lock unchanged",
  ];
  return { decision, locked, report: lines.join("\n") };
}

const COMMANDS = { scan, round, diff, finish };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const run = COMMANDS[command];
  if (!run) fail(`usage: workflow-sync.mjs <${Object.keys(COMMANDS).join("|")}> [--flags]`);
  console.log(JSON.stringify(run(flags)));
}
