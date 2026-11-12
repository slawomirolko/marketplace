import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marketplaceDir, describeAgent } from "./marketplace-agents.ts";
import { lockEntry, readLock, scanMarketplace, sourceFiles, writeLock } from "./sources-lock.ts";
import { loadWorkflowSpecs } from "./workflow-yaml.ts";
import { checkWorkflows } from "./validate-workflows.ts";
import type { Operation, RunInput, WorkflowState } from "./types.ts";

const FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface SyncItem {
  kind: "changed" | "missing" | "new";
  source: string;
  commit: string;
  diff: string;
  workflows: string[];
  yamlFiles: string[];
  ask: boolean;
}

function dirs(input: RunInput): { workflows: string; lock: string; marketplace: string } {
  const workflows = path.resolve(input.path ?? path.join(FACTORY_DIR, "workflows"));
  return { workflows, lock: path.join(path.dirname(workflows), "workflows.lock.json"), marketplace: path.resolve(input.marketplace ?? marketplaceDir()) };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function diffOf(marketplace: string, commit: string, file: string): string {
  try {
    return git(marketplace, "diff", commit, "HEAD", "--", file) || `(no textual diff between ${commit.slice(0, 7)} and HEAD)`;
  } catch {
    return `(commit ${commit.slice(0, 7)} is not in ${marketplace}; full current text follows)\n${fs.existsSync(path.join(marketplace, file)) ? fs.readFileSync(path.join(marketplace, file), "utf8") : ""}`;
  }
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) if (f.endsWith(".yaml")) fs.copyFileSync(path.join(from, f), path.join(to, f));
}

const wfsyncScan: Operation = async ({ input }) => {
  const { workflows, lock, marketplace } = dirs(input);
  const specs = loadWorkflowSpecs(workflows);
  const head = git(marketplace, "rev-parse", "HEAD");
  const scan = scanMarketplace(specs, readLock(lock), marketplace, head, (name) => describeAgent(name) !== null);
  const bySource = new Map<string, SyncItem>();
  for (const stale of scan.stale) {
    for (const [kind, files] of [["changed", stale.changed], ["missing", stale.missing]] as const) {
      for (const source of files) {
        const item = bySource.get(source) ?? { kind, source, commit: stale.commit, diff: kind === "missing" ? `${source} was removed from the marketplace` : diffOf(marketplace, stale.commit, source), workflows: [], yamlFiles: [], ask: false };
        item.workflows.push(stale.workflow);
        item.yamlFiles.push(path.join(workflows, `${stale.workflow}.yaml`));
        bySource.set(source, item);
      }
    }
  }
  const items: SyncItem[] = [...bySource.values()];
  for (const agent of scan.unmapped) {
    items.push({ kind: "new", source: agent.file, commit: head, diff: fs.readFileSync(path.join(marketplace, agent.file), "utf8"), workflows: [], yamlFiles: [], ask: true });
  }
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wfsync-"));
  copyDir(workflows, snapshot);
  const lines = [
    ...items.map((i) => `${i.kind} ${i.source}: ${i.kind === "new" ? "no workflow yet" : `${i.workflows.length} workflows`}`),
    ...scan.unlocked.map((w) => `unlocked ${w}: not in the lock`),
    ...scan.broken.map((b) => `broken ${b.workflow}#${b.node}: ${b.name} is not in the marketplace`),
  ];
  return {
    state: { items, head, workflows, lock, marketplace, snapshot, factory: FACTORY_DIR, unlocked: scan.unlocked, broken: scan.broken, total: items.length, pending: items.length + scan.unlocked.length, text: lines.join("\n") || "nothing to update" },
    metrics: { changed: items.filter((i) => i.kind === "changed").length, missing: items.filter((i) => i.kind === "missing").length, new: items.filter((i) => i.kind === "new").length, unlocked: scan.unlocked.length, broken: scan.broken.length },
    output: `Marketplace ${head.slice(0, 7)}: ${lines.length ? lines.join("; ") : "every workflow matches its sources"}.`,
  };
};

const wfsyncItem: Operation = async ({ state }) => {
  const item = (state["item-next"] as { item?: SyncItem } | undefined)?.item;
  if (!item) throw new Error("no current item");
  return { state: { ...item, ask: item.ask, yamlList: item.yamlFiles.join("\n") || "(none yet: write a new root workflow and its group files)" }, metrics: { workflows: item.workflows.length }, output: `${item.kind} ${item.source}: ${item.workflows.join(", ") || "new main agent"}.` };
};

const wfsyncValidate: Operation = async ({ state }) => {
  const scan = state.scan as { workflows: string };
  const result = checkWorkflows(scan.workflows);
  return { state: { ok: result.ok, errors: result.errors.join("\n") || "none" }, metrics: { problems: result.errors.length }, output: result.ok ? `workflows ok: ${result.workflows} files` : `${result.errors.length} problems:\n${result.errors.slice(0, 20).join("\n")}` };
};

function lastOf<T>(state: WorkflowState, node: string): T | undefined {
  return Object.values((state[node] as Record<string, T> | undefined) ?? {})[0];
}

const wfsyncCheck: Operation = async ({ state, nodeId }) => {
  const item = state.item as SyncItem;
  const previous = nodeId ? (state[nodeId] as { source?: string; round?: number; results?: unknown[] } | undefined) : undefined;
  const round = previous?.source === item.source ? (previous.round ?? 0) + 1 : 1;
  const validation = state.validate as { ok: boolean; errors: string };
  const mapping = lastOf<{ verdict: string; detail: string; text: string }>(state, "map");
  const verify = lastOf<{ verdict: string; detail: string; text: string }>(state, "verify");
  const pass = validation.ok && verify?.verdict === "pass";
  const needsOp = (mapping?.text ?? "").split(/\r?\n/).filter((l) => /needs engine (op|parser)/i.test(l)).map((l) => l.trim());
  const findings = [validation.ok ? "" : `Validation:\n${validation.errors}`, verify?.verdict === "pass" ? "" : `Verifier:\n${verify?.text ?? "no result"}`].filter(Boolean).join("\n\n");
  const next = pass ? "pass" : round < 3 ? "retry" : "ask";
  const result = { source: item.source, workflows: item.workflows, verdict: pass ? "pass" : "open", needsOp };
  const results = [...((previous?.results as (typeof result)[] | undefined) ?? []).filter((r) => r.source !== item.source), result];
  return {
    state: { source: item.source, round, next, findings: findings || "none", needsOp: needsOp.join("\n") || "none", results },
    metrics: { round, pass: pass ? 1 : 0, needsOp: needsOp.length },
    output: pass ? `${item.source}: mapped and verified${needsOp.length ? `; ${needsOp.length} steps need engine work` : ""}.` : `${item.source} round ${round}: ${validation.ok ? "valid" : "invalid"}, verifier ${verify?.verdict ?? "missing"}.`,
  };
};

const wfsyncDiff: Operation = async ({ state }) => {
  const scan = state.scan as { workflows: string; snapshot: string };
  let diff = "";
  try {
    execFileSync("git", ["diff", "--no-index", "--stat", scan.snapshot, scan.workflows], { encoding: "utf8" });
  } catch (error) {
    diff = String((error as { stdout?: string }).stdout ?? "");
  }
  let full = "";
  try {
    execFileSync("git", ["diff", "--no-index", scan.snapshot, scan.workflows], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    full = String((error as { stdout?: string }).stdout ?? "");
  }
  const changed = (diff.match(/^ \S.*\|/gm) ?? []).length;
  const results = (state.check as { results?: { source: string; needsOp: string[] }[] } | undefined)?.results ?? [];
  const needsOp = results.flatMap((r) => r.needsOp.map((n) => `${r.source}: ${n}`));
  return { state: { stat: diff.trim() || "no YAML changed", full: full.slice(0, 20000), changed, needsOp: needsOp.join("\n") || "none" }, metrics: { files: changed, needsOp: needsOp.length }, output: diff.trim() || "No YAML file changed." };
};

const wfsyncApply: Operation = async ({ state }) => {
  const scan = state.scan as { workflows: string; lock: string; marketplace: string; head: string; unlocked: string[] };
  const results = ((state.check as { results?: { workflows: string[]; verdict: string; source: string }[] } | undefined)?.results ?? []);
  const accepted = new Set<string>([...results.filter((r) => r.verdict === "pass").flatMap((r) => r.workflows), ...scan.unlocked]);
  const specs = loadWorkflowSpecs(scan.workflows);
  for (const spec of specs) if (sourceFiles(spec, scan.marketplace).some((f) => results.some((r) => r.verdict === "pass" && r.source === f))) accepted.add(spec.name);
  const lock = readLock(scan.lock);
  for (const spec of specs.filter((s) => accepted.has(s.name))) {
    const entry = lockEntry(spec, scan.marketplace, scan.head);
    if (entry) lock[spec.name] = entry;
  }
  writeLock(lock, scan.lock);
  return { state: { locked: [...accepted].sort() }, metrics: { locked: accepted.size }, output: `Lock updated for ${accepted.size} workflows at ${scan.head.slice(0, 7)}.` };
};

const wfsyncRevert: Operation = async ({ state }) => {
  const scan = state.scan as { workflows: string; snapshot: string };
  for (const f of fs.readdirSync(scan.workflows)) if (f.endsWith(".yaml") && !fs.existsSync(path.join(scan.snapshot, f))) fs.rmSync(path.join(scan.workflows, f));
  copyDir(scan.snapshot, scan.workflows);
  return { state: { reverted: true }, metrics: { reverted: 1 }, output: "Every YAML file is back to its state before the run; the lock is unchanged." };
};

const wfsyncReport: Operation = async ({ state }) => {
  const scan = state.scan as { text: string; head: string };
  const results = (state.check as { results?: { source: string; verdict: string; needsOp: string[] }[] } | undefined)?.results ?? [];
  const applied = state.apply as { locked?: string[] } | undefined;
  const lines = [
    `Marketplace ${scan.head.slice(0, 7)}`,
    `Found: ${scan.text}`,
    ...results.map((r) => `${r.source}: ${r.verdict}${r.needsOp.length ? `; needs engine work: ${r.needsOp.join(" | ")}` : ""}`),
    applied?.locked ? `Lock updated: ${applied.locked.join(", ") || "none"}` : (state.revert ? "Reverted: no YAML or lock change kept" : "Lock unchanged"),
  ];
  return { state: { text: lines.join("\n") }, metrics: { results: results.length }, output: lines.join("\n") };
};

export const WFSYNC_OPERATIONS: Record<string, Operation> = {
  "wfsync.scan": wfsyncScan,
  "wfsync.item": wfsyncItem,
  "wfsync.validate": wfsyncValidate,
  "wfsync.check": wfsyncCheck,
  "wfsync.diff": wfsyncDiff,
  "wfsync.apply": wfsyncApply,
  "wfsync.revert": wfsyncRevert,
  "wfsync.report": wfsyncReport,
};
