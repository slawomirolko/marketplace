import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marketplaceDir } from "./marketplace-agents.ts";
import { loadWorkflowSpecs } from "./workflow-yaml.ts";
import type { HostExec, WorkflowSpec } from "./types.ts";

export interface LockEntry {
  commit: string;
  files: Record<string, string>;
}

export type SourcesLock = Record<string, LockEntry>;

export interface StaleWorkflow {
  workflow: string;
  commit: string;
  changed: string[];
  missing: string[];
}

export interface MainAgent {
  agent: string;
  file: string;
  mode: string;
}

export interface MarketplaceScan {
  marketplace: string;
  head: string;
  stale: StaleWorkflow[];
  unmapped: MainAgent[];
  unlocked: string[];
  broken: { workflow: string; node: string; name: string }[];
}

const FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCK_FILE = path.join(FACTORY_DIR, "workflows.lock.json");
const SOURCE_FILE = /agents\/opencode\/[a-z0-9-]+\.md|plugins\/[a-z0-9-]+\/agents\/[a-z0-9-]+\.md|skills\/(?:\*|[a-z0-9-]+)\/[a-z0-9-]+(?:\/SKILL\.md)?/g;

function resolveSkill(ref: string, marketplace: string): string {
  if (ref.endsWith(".md")) return ref;
  const name = ref.split("/").pop()!;
  const category = ref.split("/")[1];
  const skills = path.join(marketplace, "skills");
  const categories = category === "*" ? (fs.existsSync(skills) ? fs.readdirSync(skills) : []) : [category!];
  const found = categories.find((c) => fs.existsSync(path.join(skills, c, name, "SKILL.md")));
  return found ? `skills/${found}/${name}/SKILL.md` : `skills/${category}/${name}/SKILL.md`;
}

export function sourceFiles(spec: Pick<WorkflowSpec, "source">, marketplace: string): string[] {
  const refs = spec.source?.match(SOURCE_FILE) ?? [];
  return [...new Set(refs.map((r) => (r.startsWith("skills/") ? resolveSkill(r, marketplace) : r)))].sort();
}

export function fileHash(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

export function lockEntry(spec: WorkflowSpec, marketplace: string, commit: string): LockEntry | null {
  const files = sourceFiles(spec, marketplace);
  return files.length ? { commit, files: Object.fromEntries(files.map((f) => [f, fileHash(path.join(marketplace, f)) ?? "missing"])) } : null;
}

export function buildLock(specs: WorkflowSpec[], marketplace: string, commit: string): SourcesLock {
  const lock: SourcesLock = {};
  for (const spec of specs) {
    const entry = lockEntry(spec, marketplace, commit);
    if (entry) lock[spec.name] = entry;
  }
  return lock;
}

export function readLock(file = LOCK_FILE): SourcesLock {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as SourcesLock) : {};
}

export function writeLock(lock: SourcesLock, file = LOCK_FILE): void {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
}

export function staleWorkflows(lock: SourcesLock, marketplace: string): StaleWorkflow[] {
  return Object.entries(lock).flatMap(([workflow, entry]) => {
    const changed: string[] = [];
    const missing: string[] = [];
    for (const [file, hash] of Object.entries(entry.files)) {
      const now = fileHash(path.join(marketplace, file));
      if (now === null) missing.push(file);
      else if (now !== hash) changed.push(file);
    }
    return changed.length || missing.length ? [{ workflow, commit: entry.commit, changed, missing }] : [];
  });
}

function frontmatter(file: string): string {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
}

export function mainAgents(marketplace: string): MainAgent[] {
  const found: MainAgent[] = [];
  const opencode = path.join(marketplace, "agents", "opencode");
  for (const f of fs.existsSync(opencode) ? fs.readdirSync(opencode).filter((f) => f.endsWith(".md") && f !== "README.md") : []) {
    const mode = frontmatter(path.join(opencode, f)).match(/^mode:\s*([a-z]+)/m)?.[1] ?? "all";
    if (mode === "primary" || mode === "all") found.push({ agent: f.replace(/\.md$/, ""), file: `agents/opencode/${f}`, mode });
  }
  const plugins = path.join(marketplace, "plugins");
  for (const plugin of fs.existsSync(plugins) ? fs.readdirSync(plugins) : []) {
    const dir = path.join(plugins, plugin, "agents");
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : []) {
      if (/^tools:.*\bAgent\b/m.test(frontmatter(path.join(dir, f)))) found.push({ agent: f.replace(/\.md$/, ""), file: `plugins/${plugin}/agents/${f}`, mode: "plugin delegator" });
    }
  }
  return found.sort((a, b) => a.agent.localeCompare(b.agent));
}

export function scanMarketplace(specs: WorkflowSpec[], lock: SourcesLock, marketplace: string, head: string, exists: (name: string) => boolean): MarketplaceScan {
  const mapped = new Set(specs.flatMap((s) => sourceFiles(s, marketplace)));
  const broken = specs.flatMap((s) =>
    s.nodes.flatMap((n) => {
      const names = [n.agent, n.skill, ...(n.agents ?? []).map((a) => a.agent)].filter((x): x is string => typeof x === "string");
      return names.filter((name) => !exists(name)).map((name) => ({ workflow: s.name, node: n.id, name }));
    }),
  );
  return {
    marketplace,
    head,
    stale: staleWorkflows(lock, marketplace),
    unmapped: mainAgents(marketplace).filter((a) => !mapped.has(a.file)),
    unlocked: specs.filter((s) => !lock[s.name] && sourceFiles(s, marketplace).length > 0).map((s) => s.name),
    broken,
  };
}

export interface UpdateResult {
  marketplace: string;
  before: string;
  after: string;
  changedFiles: string[];
}

export async function updateMarketplace(exec: HostExec, marketplace: string): Promise<UpdateResult> {
  const git = async (...args: string[]) => {
    const result = await exec("git", ["-C", marketplace, ...args]);
    if (result.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim().slice(-300)}`);
    return result.stdout.trim();
  };
  const branch = await git("branch", "--show-current");
  if (branch !== "main") throw new Error(`${marketplace} is on '${branch || "a detached HEAD"}', not main; nothing was pulled. Switch it to main yourself or point FACTORY_MARKETPLACE_DIR at a main checkout.`);
  if (await git("status", "--porcelain", "--untracked-files=no")) throw new Error(`${marketplace} has uncommitted changes; nothing was pulled.`);
  const before = await git("rev-parse", "HEAD");
  await git("fetch", "--quiet", "origin", "main");
  await git("merge", "--ff-only", "origin/main");
  const after = await git("rev-parse", "HEAD");
  const changedFiles = before === after ? [] : (await git("diff", "--name-only", before, after)).split(/\r?\n/).filter(Boolean);
  return { marketplace, before, after, changedFiles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const marketplace = marketplaceDir();
  const commit = process.argv[2] ?? execFileSync("git", ["-C", marketplace, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const lock = buildLock(loadWorkflowSpecs(path.join(FACTORY_DIR, "workflows")), marketplace, commit);
  writeLock(lock);
  console.log(`${Object.keys(lock).length} workflows locked against ${marketplace} at ${commit} in ${LOCK_FILE}`);
}
