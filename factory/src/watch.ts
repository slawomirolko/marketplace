// Interval watches: a generic trigger that starts workflow runs from a command's output.
//
// A watch runs its command once per project every `everyMinutes`, reads a list of
// items from the command's JSON output, and starts one run of its workflow for each
// item whose key was seen in `stableChecks` consecutive checks. The run starts with
// the watch's backend and stops at its first question, so nothing happens until the
// user answers it. The watch knows no agent or workflow: everything specific lives
// in config/factory.yaml and in the workflow.
import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { loadFactoryConfig } from "./config.ts";
import type { CliName, ExecResult, RunInput } from "./types.ts";
import type { Factory } from "./engine.ts";

export interface WatchSpec {
  id: string;
  everyMinutes: number;
  stableChecks: number;
  command: string[];
  projectsWhen: string;
  items: string;
  skipWhen: string[];
  key: string;
  workflow: string;
  goal: string;
  input: Record<string, string>;
  backend: { kind: "cli"; cli: CliName };
}

export interface WatchContext {
  factory: Factory;
  dataDir: string;
  marketplace: string;
  exec: (command: string, args: string[], options?: { cwd?: string }) => Promise<ExecResult>;
  log?: (message: string) => void;
}

interface WatchState {
  // key -> number of consecutive checks that saw it
  seen: Record<string, number>;
}

const RENDER = (template: string, view: Record<string, unknown>): string => Mustache.render(template, view, {}, { escape: (value: unknown) => String(value) });

export function loadWatches(): WatchSpec[] {
  return loadFactoryConfig().watches;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

export function projectsFile(dataDir: string): string {
  return path.join(dataDir, "projects.json");
}

/** Projects the factory knows: the ones listed in projects.json and every run's input.project. */
export function knownProjects(dataDir: string): string[] {
  const listed = readJson<{ dirs?: unknown }>(projectsFile(dataDir), {}).dirs;
  const dirs = new Set<string>(Array.isArray(listed) ? listed.filter((d): d is string => typeof d === "string") : []);
  const runsDir = path.join(dataDir, "runs");
  if (fs.existsSync(runsDir)) {
    for (const file of fs.readdirSync(runsDir).filter((f) => f.endsWith(".json"))) {
      const project = readJson<{ input?: { project?: unknown } }>(path.join(runsDir, file), {}).input?.project;
      if (typeof project === "string" && project.length > 0) dirs.add(path.resolve(project));
    }
  }
  return [...dirs].sort();
}

function itemsOf(output: unknown, dotted: string): Record<string, unknown>[] {
  const value = dotted.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), output);
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function stateFile(dataDir: string, watch: WatchSpec): string {
  return path.join(dataDir, "watches", `${watch.id}.json`);
}

/** One check of one watch over every qualifying project. Returns the ids of the runs it started. */
export async function checkWatch(watch: WatchSpec, context: WatchContext): Promise<string[]> {
  const { factory, dataDir, marketplace, exec } = context;
  const log = context.log ?? (() => undefined);
  const file = stateFile(dataDir, watch);
  const previous = readJson<WatchState>(file, { seen: {} });
  const seen: Record<string, number> = {};
  const started: string[] = [];
  for (const project of knownProjects(dataDir)) {
    if (!fs.existsSync(path.join(project, watch.projectsWhen))) continue;
    const view = { project, projectName: path.basename(project), marketplace, node: process.execPath };
    const [command, ...args] = watch.command.map((part) => RENDER(part, view));
    if (!command) continue;
    const result = await exec(command, args, { cwd: project });
    if (result.code !== 0) {
      log(`watch ${watch.id}: command failed in a project (exit ${result.code})`);
      continue;
    }
    let output: unknown;
    try {
      output = JSON.parse(result.stdout);
    } catch {
      log(`watch ${watch.id}: command output is not JSON`);
      continue;
    }
    for (const item of itemsOf(output, watch.items)) {
      if (watch.skipWhen.some((field) => Boolean(item[field]))) continue;
      const itemView = { ...view, item: { ...item, files: Array.isArray(item.files) ? item.files.join(", ") : item.files } };
      const key = `${project}::${RENDER(watch.key, itemView)}`;
      seen[key] = (previous.seen[key] ?? 0) + 1;
      if (seen[key] < watch.stableChecks) continue;
      const input: RunInput = Object.fromEntries(Object.entries(watch.input).map(([name, template]) => [name, RENDER(template, itemView)]));
      const { run, reused } = factory.start(RENDER(watch.goal, itemView), `watch:${watch.id}:${key}`, { workflow: watch.workflow, input });
      if (reused) continue;
      // The config never names a model; FACTORY_WATCH_MODEL picks one model for every tier of watch runs.
      const model = process.env.FACTORY_WATCH_MODEL;
      factory.confirm(run.runId, { backend: watch.backend, ...(model ? { tierModels: { low: model, medium: model, high: model } } : {}) });
      started.push(run.runId);
      log(`watch ${watch.id}: started run ${run.runId}`);
    }
  }
  writeJson(file, { seen } satisfies WatchState);
  return started;
}

/** Runs every configured watch now and then every `everyMinutes`. Returns a function that stops them. */
export function startWatches(watches: WatchSpec[], context: WatchContext): () => void {
  const timers: NodeJS.Timeout[] = [];
  for (const watch of watches) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await checkWatch(watch, context);
      } catch (error) {
        context.log?.(`watch ${watch.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), watch.everyMinutes * 60_000);
    timer.unref();
    timers.push(timer);
  }
  return () => timers.forEach(clearInterval);
}
