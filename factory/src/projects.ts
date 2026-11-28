import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFactoryConfig } from "./config.ts";
import { homeDataDir, longPath, readJsonFile, writeFileAtomic } from "./paths.ts";
import { definedFields } from "./fields.ts";
import type { ProjectsConfig, RunInput } from "./types.ts";

/** A local project that uses the marketplace. Only the id and the folder are stored; everything else is read from the folder when needed. */
export interface Project {
  id: string;
  path: string;
  /** A marketplace checkout for this project, when it is not the factory's own. */
  marketplace?: string;
}

export interface ProjectRegistry {
  schemaVersion: 1;
  /** Folders that discovery searches. */
  roots: string[];
  projects: Project[];
}

export interface ProjectCandidate {
  path: string;
  suggestedId: string;
  markers: string[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SKIP = new Set(["node_modules", ".git", "dist", "build", "bin", "obj", "target", ".venv", "venv"]);

/** The registry file. It lives in the user's factory home, never in a repository. */
export function projectsFile(): string {
  return process.env.FACTORY_PROJECTS_FILE ?? path.join(homeDataDir(), "projects.json");
}

/** The registry; a missing file is an empty one. A file that cannot be read or parsed is an error, so no change ever overwrites the projects it holds. */
export function readRegistry(file = projectsFile()): ProjectRegistry {
  const raw = readJsonFile<Partial<ProjectRegistry>>(file);
  if (raw === undefined) {
    return { schemaVersion: 1, roots: [], projects: [] };
  }
  const projects = Array.isArray(raw.projects) ? raw.projects.filter((p): p is Project => !!p && typeof p.id === "string" && ID.test(p.id) && typeof p.path === "string") : [];
  const roots = Array.isArray(raw.roots) ? raw.roots.filter((r): r is string => typeof r === "string") : [];
  return { schemaVersion: 1, roots, projects };
}

function writeRegistry(registry: ProjectRegistry, file = projectsFile()): ProjectRegistry {
  writeFileAtomic(file, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

function sameFolder(a: string, b: string): boolean {
  const norm = (p: string) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  return norm(a) === norm(b);
}

function folder(dir: string, what: string): string {
  if (typeof dir !== "string" || !dir.trim()) throw new Error(`${what} must be a folder path`);
  const full = path.resolve(dir);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error(`${what} ${full} is not a folder`);
  return full;
}

/** A kebab-case id from a folder name that no project uses yet. */
export function suggestId(dir: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = path.basename(path.resolve(dir)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "project";
  const start = /^[a-z0-9]/.test(base) ? base : `p-${base}`;
  let id = start;
  for (let n = 2; used.has(id); n += 1) id = `${start}-${n}`;
  return id;
}

export function listProjects(file = projectsFile()): Project[] {
  return readRegistry(file).projects;
}

export function projectById(id: string, file = projectsFile()): Project {
  const project = readRegistry(file).projects.find((p) => p.id === id);
  if (!project) throw new Error(`unknown project ${id}; add it first`);
  return project;
}

export function addProject(request: { path: string; id?: string; marketplace?: string }, file = projectsFile()): Project {
  const registry = readRegistry(file);
  const dir = folder(request.path, "project");
  const existing = registry.projects.find((p) => sameFolder(p.path, dir));
  if (existing) throw new Error(`folder already registered as ${existing.id}`);
  if (request.id !== undefined && !ID.test(request.id)) throw new Error("id must be kebab-case: lowercase letters, digits and -");
  if (request.id && registry.projects.some((p) => p.id === request.id)) throw new Error(`id ${request.id} is taken`);
  const project: Project = { id: request.id ?? suggestId(dir, registry.projects.map((p) => p.id)), path: dir, ...(request.marketplace ? { marketplace: folder(request.marketplace, "marketplace") } : {}) };
  writeRegistry({ ...registry, projects: [...registry.projects, project] }, file);
  return project;
}

export function removeProject(id: string, file = projectsFile()): Project {
  const registry = readRegistry(file);
  const project = registry.projects.find((p) => p.id === id);
  if (!project) throw new Error(`unknown project ${id}`);
  writeRegistry({ ...registry, projects: registry.projects.filter((p) => p.id !== id) }, file);
  return project;
}

export function addRoot(dir: string, file = projectsFile()): string[] {
  const registry = readRegistry(file);
  const full = folder(dir, "root");
  if (registry.roots.some((r) => sameFolder(r, full))) return registry.roots;
  return writeRegistry({ ...registry, roots: [...registry.roots, full] }, file).roots;
}

export function removeRoot(dir: string, file = projectsFile()): string[] {
  const registry = readRegistry(file);
  return writeRegistry({ ...registry, roots: registry.roots.filter((r) => !sameFolder(r, dir)) }, file).roots;
}

/** A linked git worktree has a `.git` file, not a folder; its main checkout is the project. The file's `gitdir:` path names `.../worktrees/<name>`, which tells a worktree apart from a submodule, whose `.git` file points into `.../modules/`. */
function isLinkedWorktree(dir: string): boolean {
  const dotGit = path.join(dir, ".git");
  try {
    return fs.statSync(dotGit).isFile() && /\/worktrees\//.test(fs.readFileSync(dotGit, "utf8").replace(/\\/g, "/"));
  } catch {
    return false;
  }
}

/**
 * Folders under the roots that hold at least one marker and are not registered yet.
 * It never descends into a candidate, a linked worktree, a skipped folder or a hidden folder.
 * Discovery only proposes; nothing is registered until the user adds a candidate.
 */
export function discoverProjects(settings: Required<Pick<ProjectsConfig, "markers" | "maxDepth">>, roots?: string[], file = projectsFile()): ProjectCandidate[] {
  const registry = readRegistry(file);
  const searched = (roots ?? registry.roots).filter((root) => fs.existsSync(root));
  const taken = registry.projects.map((project) => project.id);
  const found: ProjectCandidate[] = [];
  const visit = (dir: string, depth: number) => {
    if (isLinkedWorktree(dir)) {
      return;
    }
    const markers = settings.markers.filter((marker) => fs.existsSync(path.join(dir, marker)));
    if (markers.length) {
      if (!registry.projects.some((project) => sameFolder(project.path, dir)) && !found.some((candidate) => sameFolder(candidate.path, dir))) {
        const suggestedId = suggestId(dir, [...taken, ...found.map((candidate) => candidate.suggestedId)]);
        found.push({ path: dir, suggestedId, markers });
      }
      return;
    }
    if (depth >= settings.maxDepth) {
      return;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP.has(entry.name)) {
        continue;
      }
      visit(path.join(dir, entry.name), depth + 1);
    }
  };
  for (const root of searched) {
    visit(path.resolve(root), 0);
  }
  return found.sort((first, second) => first.path.localeCompare(second.path));
}

/** The run input for a registered project: its folder, its id and, when set, its marketplace. */
export function projectInput(id: string, file = projectsFile()): { project: string; projectId: string; marketplace?: string } {
  const project = projectById(id, file);
  if (!fs.existsSync(project.path)) throw new Error(`project ${id}: folder ${project.path} does not exist`);
  return { project: project.path, projectId: project.id, ...definedFields({ marketplace: project.marketplace }) };
}

/** The run input of a run started for a registered project: its folder as `project`, its id, and its marketplace unless the input names one. */
export function projectScopedInput(projectId: string | undefined, input: RunInput): RunInput {
  if (!projectId) return input;
  const scoped = projectInput(projectId);
  if (input.project && longPath(input.project) !== longPath(scoped.project)) throw new Error(`input.project is not the folder of project ${projectId}; pass one of them`);
  return { ...definedFields({ marketplace: scoped.marketplace }), ...input, project: scoped.project, projectId: scoped.projectId };
}

export interface ProjectsActionRequest {
  action: "list" | "add" | "remove" | "add_root" | "remove_root" | "discover";
  path?: string;
  id?: string;
  marketplace?: string;
}

/** One project registry action, shared by the MCP tool and the viewer. */
export function projectsAction({ action, path: dir, id, marketplace }: ProjectsActionRequest): object {
  if (action === "list") return readRegistry();
  if (action === "add") return { project: addProject({ path: dir ?? "", ...definedFields({ id, marketplace }) }) };
  if (action === "remove") return { project: removeProject(id ?? "") };
  if (action === "add_root") return { roots: addRoot(dir ?? "") };
  if (action === "remove_root") return { roots: removeRoot(dir ?? "") };
  if (action === "discover") return { candidates: discoverProjects(loadFactoryConfig().projects, dir ? [dir] : undefined) };
  throw new Error(`unknown projects action ${String(action)}`);
}

const USAGE = "usage: projects.ts list | add <folder> [--id <id>] [--marketplace <folder>] | remove <id> | roots | roots add <folder> | roots remove <folder> | discover [--root <folder>]";

/** The command line: every command prints one JSON value. */
export function projectsCli(argv: string[], file = projectsFile()): unknown {
  const [command, ...rest] = argv;
  const flag = (name: string) => {
    const index = rest.indexOf(`--${name}`);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const positional = rest.filter((arg, index) => !arg.startsWith("--") && !(index > 0 && rest[index - 1]?.startsWith("--")));
  switch (command) {
    case "list":
      return readRegistry(file);
    case "add":
      return addProject({ path: positional[0] ?? "", ...definedFields({ id: flag("id"), marketplace: flag("marketplace") }) }, file);
    case "remove":
      return removeProject(positional[0] ?? "", file);
    case "roots":
      if (positional[0] === "add") return addRoot(positional[1] ?? "", file);
      if (positional[0] === "remove") return removeRoot(positional[1] ?? "", file);
      return readRegistry(file).roots;
    case "discover": {
      const root = flag("root");
      return discoverProjects(loadFactoryConfig().projects, root ? [root] : undefined, file);
    }
    default:
      throw new Error(USAGE);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(projectsCli(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
