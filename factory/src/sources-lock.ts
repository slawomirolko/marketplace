import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marketplaceDir } from "./marketplace-agents.ts";
import { loadWorkflowSpecs } from "./workflow-yaml.ts";
import type { HostExec, WorkflowSpec } from "./types.ts";

export type SourcesLock = Record<string, Record<string, string>>;

export interface StaleWorkflow {
  workflow: string;
  changed: string[];
  missing: string[];
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

export function buildLock(specs: WorkflowSpec[], marketplace: string): SourcesLock {
  const lock: SourcesLock = {};
  for (const spec of [...specs].sort((a, b) => a.name.localeCompare(b.name))) {
    const files = sourceFiles(spec, marketplace);
    if (files.length) lock[spec.name] = Object.fromEntries(files.map((f) => [f, fileHash(path.join(marketplace, f)) ?? "missing"]));
  }
  return lock;
}

export function readLock(file = LOCK_FILE): SourcesLock {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as SourcesLock) : {};
}

export function staleWorkflows(lock: SourcesLock, marketplace: string): StaleWorkflow[] {
  return Object.entries(lock).flatMap(([workflow, files]) => {
    const changed: string[] = [];
    const missing: string[] = [];
    for (const [file, hash] of Object.entries(files)) {
      const now = fileHash(path.join(marketplace, file));
      if (now === null) missing.push(file);
      else if (now !== hash) changed.push(file);
    }
    return changed.length || missing.length ? [{ workflow, changed, missing }] : [];
  });
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
  const lock = buildLock(loadWorkflowSpecs(path.join(FACTORY_DIR, "workflows")), marketplace);
  fs.writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`${Object.keys(lock).length} workflows locked against ${marketplace} in ${LOCK_FILE}`);
}
