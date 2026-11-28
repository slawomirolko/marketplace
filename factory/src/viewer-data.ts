import fs from "node:fs";
import { loadWorkflowSpecs } from "./workflow-yaml.ts";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Factory, loadedWorkflows } from "./engine.ts";
import { errorMessage } from "./errors.ts";
import { runReport, subgraphCosts } from "./run-report.ts";
import type { SubgraphCost } from "./run-report.ts";
import { runTimeline } from "./run-timing.ts";
import type { RunTimeline } from "./run-timing.ts";
import { homeDataDir, readSources } from "./paths.ts";
import { describeAgent, marketplaceDir } from "./marketplace-agents.ts";
import { readQuestions } from "./questions.ts";
import type { AskedQuestion } from "./questions.ts";
import { loadFactoryConfig, memoryLayerOf, projectsOf } from "./config.ts";
import { projectScopedInput, projectsAction, readRegistry } from "./projects.ts";
import type { Project, ProjectsActionRequest } from "./projects.ts";
import { standaloneNames, workflowsThatRan } from "./standalone.ts";
import { readLock, scanMarketplace, updateMarketplace } from "./sources-lock.ts";
import { definedFields } from "./fields.ts";
import type { MarketplaceScan, UpdateResult } from "./sources-lock.ts";
import { execFileSync } from "node:child_process";
import { hostExec } from "./cli-backend.ts";
import type { AgentInfo } from "./marketplace-agents.ts";
import type { Coverage, FactoryConfigFile, Report, Run, WorkflowSpec } from "./types.ts";

const RUN_ID = /^r-[a-f0-9]{8}$/;

export interface DataApiOptions {
  factoryDir: string;
  dataDir: string;
  configFile: string;
  demo: boolean;
  /** The factory of this process. Only its own runs can be answered from the viewer. */
  factory?: Factory;
}

/** The report of one run as the viewer shows it, with subgraph costs for the graph of the run's own workflow. */
export function viewerReport(run: Run, specs: WorkflowSpec[]): ViewerReport {
  const report = runReport(run);
  const root = report.workflow.split("@")[0] ?? report.workflow;
  return { ...report, ...runTimeline(run), bySubgraph: subgraphCosts(specs, root, report.byNode) };
}

export interface PendingDecision {
  runId: string;
  goal: string;
  workflow: string;
  questionId: string;
  text: string;
  allowed: string[];
}

export interface RunListItem {
  runId: string;
  goal: string;
  status: Run["status"];
  createdAt: string | null;
  costUsd: number;
  coverage: Coverage;
  harness: string | null;
  synthetic: boolean;
  requestedModels: string[];
  usedModels: string[];
  source: string;
  workflow: string;
  ran: string[];
  projectId: string | null;
}

/** The latest finished status run of a project and the status file it wrote. */
export interface ProjectStatusView {
  runId: string;
  status: Run["status"];
  createdAt: string | null;
  data: unknown;
}

export interface ProjectView extends Project {
  exists: boolean;
  runs: number;
  /** The status run that is in progress for this project, if any. */
  analyzing: string | null;
  status: { runId: string; createdAt: string | null; summary: string | null; counts: Record<string, number> | null } | null;
}

/** The run report with what the viewer draws on top of it: the cost of each subgraph and the timed passes and calls. */
export interface ViewerReport extends Report, RunTimeline {
  bySubgraph: Record<string, SubgraphCost>;
}

export interface RunDetail {
  run: Pick<Run, "runId" | "goal" | "status" | "config" | "answers" | "ledger" | "events" | "pendingQuestion" | "pendingWorkItems">;
  report: ViewerReport;
  questions: AskedQuestion[];
}

export interface DataApi {
  dataDir: string;
  ensureDemo(): Promise<boolean>;
  workflows(): (WorkflowSpec & { standalone: boolean })[];
  agents(): Record<string, AgentInfo>;
  config(): FactoryConfigFile;
  runs(): RunListItem[];
  run(runId: string): RunDetail | null;
  stale(): MarketplaceScan;
  update(): Promise<UpdateResult & MarketplaceScan>;
  projects(): { roots: string[]; projects: ProjectView[]; statusWorkflow: string; statusWorkflowInstalled: boolean; canAnalyze: boolean };
  projectStatus(id: string): ProjectStatusView | null;
  projectsAction(request: ViewerProjectsRequest): object;
  pending(): PendingDecision[];
  answer(runId: string, questionId: string, answer: string): PendingDecision[];
}

export interface ApiRequest {
  method?: string | undefined;
  url?: string | undefined;
  headers?: Record<string, string | string[] | undefined>;
  on?(event: string, listener: (chunk?: unknown) => void): unknown;
}

const MAX_BODY = 16 * 1024;

function readBody(req: ApiRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!req.on) return resolve(undefined);
    let data = "";
    req.on("data", (chunk) => {
      data += String(chunk);
      if (data.length > MAX_BODY) reject(new Error("request body is too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch {
        reject(new Error("request body is not JSON"));
      }
    });
    req.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
  });
}

/** A project action from the viewer: a registry action, or analyze, which starts the status workflow for one project. */
export type ViewerProjectsRequest = Omit<ProjectsActionRequest, "action"> & { action: ProjectsActionRequest["action"] | "analyze" };

const PROJECT_ACTIONS = new Set(["add", "remove", "add_root", "remove_root", "discover", "analyze"]);
const IN_PROGRESS = new Set<Run["status"]>(["needs_confirmation", "running", "waiting_for_user", "waiting_for_client"]);

/** A project action from the viewer: only the known fields, only strings. */
export function parseProjectsAction(body: unknown): ViewerProjectsRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("the request body must be a JSON object");
  const b = body as Record<string, unknown>;
  if (typeof b.action !== "string" || !PROJECT_ACTIONS.has(b.action)) throw new Error("action must be add, remove, add_root, remove_root, discover or analyze");
  const text = (name: string) => {
    const value = b[name];
    if (value === undefined || value === "") return undefined;
    if (typeof value !== "string" || value.length > 1000) throw new Error(`${name} must be a string`);
    return value;
  };
  const dir = text("path");
  const id = text("id");
  const marketplace = text("marketplace");
  return { action: b.action as ViewerProjectsRequest["action"], ...definedFields({ path: dir, id, marketplace }) };
}

/** The status file named in a status run's state; only JSON files in the factory home's project-status folder. */
export function statusFileOf(state: unknown, statusDir = path.join(homeDataDir(), "project-status")): string | null {
  if (!state || typeof state !== "object") return null;
  const root = path.resolve(statusDir);
  const queue: unknown[] = [state];
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object") continue;
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (key === "file" && typeof inner === "string" && inner.endsWith(".json")) {
        const full = path.resolve(inner);
        if (full.startsWith(root + path.sep) && fs.existsSync(full)) return full;
      } else if (inner && typeof inner === "object") queue.push(inner);
    }
  }
  return null;
}

export interface JsonResponse {
  writeHead(status: number, headers: Record<string, string>): { end(body: string): unknown };
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function finishFakeRun(factory: Factory, goal: string): Promise<Run> {
  const { run } = factory.start(goal);
  factory.confirm(run.runId, { backend: { kind: "fake" } });
  for (;;) {
    const { run: current } = await factory.waitForChange(run.runId, 30000);
    const question = current.pendingQuestion;
    if (current.status === "waiting_for_user" && question) {
      factory.answer(run.runId, question.id, question.id === "q-budget-pause" ? "continue" : "extend");
      continue;
    }
    if (current.status !== "running") return current;
  }
}

/** Runs of this process that wait for an answer with fixed choices: the viewer can answer them. */
function answerable(factory: Factory | undefined): Run[] {
  if (!factory) return [];
  return [...factory.runs.values()].filter((run) => run.status === "waiting_for_user" && run.ownerPid === process.pid && Boolean(run.pendingQuestion?.allowed?.length));
}

export function createDataApi({ factoryDir, dataDir, configFile, demo, factory }: DataApiOptions): DataApi {
  const readConfig = (): FactoryConfigFile => {
    const text = fs.readFileSync(configFile, "utf8");
    return (/\.ya?ml$/i.test(configFile) ? parseYaml(text) : JSON.parse(text)) as FactoryConfigFile;
  };
  const runsDir = path.join(dataDir, "runs");

  function runFiles(): string[] {
    if (!fs.existsSync(runsDir)) return [];
    return fs.readdirSync(runsDir).filter((f) => RUN_ID.test(path.basename(f, ".json")));
  }

  function allRunFiles(): { file: string; source: string }[] {
    const sources = [path.resolve(dataDir), ...(path.resolve(dataDir) === path.resolve(homeDataDir()) ? readSources() : [])];
    return [...new Set(sources)].flatMap((dir) => {
      const runs = path.join(dir, "runs");
      if (!fs.existsSync(runs)) return [];
      const source = dir === path.resolve(dataDir) ? "main" : `test · ${path.basename(dir)}`;
      return fs.readdirSync(runs).filter((f) => RUN_ID.test(path.basename(f, ".json"))).map((f) => ({ file: path.join(runs, f), source }));
    });
  }

  let demoRun: Promise<Run> | null = null;

  return {
    dataDir,

    async ensureDemo() {
      if (demoRun) {
        await demoRun;
        return false;
      }
      if (!demo || runFiles().length > 0) return false;
      demoRun = finishFakeRun(new Factory(dataDir, { backend: "fake" }), "add a greeting function (demo run, fake model)").catch((error: unknown) => {
        demoRun = null;
        throw error;
      });
      await demoRun;
      return true;
    },

    workflows() {
      const specs = loadWorkflowSpecs(path.join(factoryDir, "workflows"));
      const standalone = standaloneNames(specs, marketplaceDir());
      return specs.map((s) => ({ ...s, standalone: standalone.has(s.name) }));
    },

    agents() {
      const memoryLayer = memoryLayerOf(readConfig());
      const names = new Set<string>();
      for (const w of loadWorkflowSpecs(path.join(factoryDir, "workflows"))) {
        for (const n of w.nodes) {
          if (n.agent) names.add(n.agent);
          if (n.skill) names.add(n.skill);
          for (const a of n.agents ?? []) if (a.agent) names.add(a.agent);
        }
      }
      return Object.fromEntries([...names].sort().flatMap((name) => {
        const info = describeAgent(name, memoryLayer);
        return info ? [[name, info]] : [];
      }));
    },

    config() {
      return readConfig();
    },

    runs() {
      const specs = loadWorkflowSpecs(path.join(factoryDir, "workflows"));
      return allRunFiles()
        .flatMap(({ file, source }) => {
          try {
            return [{ run: readJson(file) as Run, source }];
          } catch {
            return [];
          }
        })
        .map(({ run, source }) => ({ run, source, report: runReport(run) }))
        .map(({ run, source, report }) => ({
          source,
          runId: run.runId,
          goal: run.goal,
          workflow: report.workflow.split("@")[0] ?? report.workflow,
          projectId: typeof run.input?.projectId === "string" ? run.input.projectId : null,
          ran: workflowsThatRan(specs, report.workflow.split("@")[0] ?? report.workflow, run.events.filter((e) => e.type === "node_started" && typeof e.node === "string").map((e) => String(e.node))),
          status: run.status,
          createdAt: run.events[0]?.at ?? null,
          costUsd: report.cost.costUsd,
          coverage: report.coverage.run,
          harness: run.config?.backend?.kind === "cli" ? (run.config.backend.cli ?? null) : (run.config?.backend?.kind ?? null),
          synthetic: report.synthetic,
          requestedModels: [...new Set(Object.values(run.config?.tiers ?? {}))],
          usedModels: [...new Set(run.ledger.filter((r) => r.kind === "llm" && r.model).map((r) => r.model ?? ""))],
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    run(runId) {
      if (!RUN_ID.test(runId)) return null;
      const file = allRunFiles().find((f) => path.basename(f.file, ".json") === runId)?.file;
      if (!file || !fs.existsSync(file)) return null;
      const run = readJson(file) as Run;
      const { runId: id, goal, status, config, answers, ledger, events, pendingQuestion, pendingWorkItems } = run;
      return { run: { runId: id, goal, status, config, answers, ledger, events, pendingQuestion, pendingWorkItems }, report: viewerReport(run, loadWorkflowSpecs(path.join(factoryDir, "workflows"))), questions: readQuestions(path.dirname(path.dirname(file)), id) };
    },

    stale() {
      return scan(factoryDir);
    },

    pending() {
      return answerable(factory).map((run) => ({
        runId: run.runId,
        goal: run.goal,
        workflow: run.workflow ?? "",
        questionId: run.pendingQuestion?.id ?? "",
        text: run.pendingQuestion?.text ?? "",
        allowed: run.pendingQuestion?.allowed ?? [],
      }));
    },

    answer(runId, questionId, answer) {
      const run = answerable(factory).find((r) => r.runId === runId);
      if (!factory || !run) throw new Error("this run does not wait for an answer from the viewer; answer it in the session that owns it");
      factory.answer(runId, questionId, answer);
      return this.pending();
    },

    async update() {
      const result = await updateMarketplace(hostExec, marketplaceDir());
      return { ...result, ...scan(factoryDir) };
    },

    projects() {
      const statusWorkflow = projectsOf(readConfig()).statusWorkflow;
      const registry = readRegistry();
      const runs = projectRuns();
      return {
        roots: registry.roots,
        statusWorkflow,
        statusWorkflowInstalled: loadedWorkflows().has(statusWorkflow),
        canAnalyze: Boolean(factory),
        projects: registry.projects.map((p) => {
          const own = runs.filter((r) => r.run.input?.projectId === p.id);
          const latest = latestStatus(own, statusWorkflow);
          const data = latest ? (readStatusFile(latest.run) as { summary?: string; counts?: Record<string, number> } | null) : null;
          return { ...p, exists: fs.existsSync(p.path), runs: own.length, analyzing: activeStatus(own, statusWorkflow)?.runId ?? null, status: latest ? { runId: latest.run.runId, createdAt: latest.createdAt, summary: data?.summary ?? null, counts: data?.counts ?? null } : null };
        }),
      };
    },

    projectStatus(id) {
      const latest = latestStatus(projectRuns().filter((r) => r.run.input?.projectId === id), projectsOf(readConfig()).statusWorkflow);
      if (!latest) return null;
      return { runId: latest.run.runId, status: latest.run.status, createdAt: latest.createdAt, data: readStatusFile(latest.run) };
    },

    projectsAction(request) {
      if (request.action === "analyze") return analyze(request.id ?? "");
      return projectsAction({ ...request, action: request.action });
    },
  };

  function analyze(id: string): { runId: string; status: Run["status"]; reused: boolean } {
    if (!factory) throw new Error("this viewer cannot start runs; open the viewer of the factory server");
    const statusWorkflow = projectsOf(readConfig()).statusWorkflow;
    if (!loadedWorkflows().has(statusWorkflow)) throw new Error(`workflow ${statusWorkflow} is not installed`);
    const input = projectScopedInput(id, {});
    const active = activeStatus(projectRuns().filter((r) => r.run.input?.projectId === id), statusWorkflow);
    if (active) return { runId: active.runId, status: active.status, reused: true };
    const { statusBackend } = loadFactoryConfig().projects;
    if (!statusBackend && factory.defaultConfig.backend.kind === "delegate") throw new Error("the status workflow needs a CLI backend: set projects.statusBackend in the factory config");
    const { run } = factory.start(`Status of project ${id}`, undefined, { workflow: statusWorkflow, input });
    const started = factory.confirm(run.runId, statusBackend ? { backend: statusBackend } : {});
    return { runId: started.runId, status: started.status, reused: false };
  }

  function projectRuns(): { run: Run; createdAt: string | null }[] {
    return allRunFiles().flatMap(({ file }) => {
      try {
        const run = readJson(file) as Run;
        return run.input?.projectId ? [{ run, createdAt: run.events[0]?.at ?? null }] : [];
      } catch {
        return [];
      }
    });
  }
}

function activeStatus(runs: { run: Run }[], workflow: string): Run | null {
  return runs.find((r) => r.run.workflow === workflow && IN_PROGRESS.has(r.run.status))?.run ?? null;
}

function latestStatus(runs: { run: Run; createdAt: string | null }[], workflow: string): { run: Run; createdAt: string | null } | null {
  return runs.filter((r) => r.run.workflow === workflow && r.run.status === "done").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
}

function readStatusFile(run: Run): unknown {
  const file = statusFileOf(run.state);
  if (!file) return null;
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function scan(factoryDir: string): MarketplaceScan {
  const marketplace = marketplaceDir();
  let head = "";
  try {
    head = execFileSync("git", ["-C", marketplace, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    head = "";
  }
  const specs = loadWorkflowSpecs(path.join(factoryDir, "workflows"));
  return scanMarketplace({ specs, lock: readLock(), marketplace, head, exists: (name) => describeAgent(name) !== null });
}

/**
 * A state-changing request must come from the viewer page itself: the custom header forces a CORS preflight, and
 * the Origin, which browsers send on every cross-origin POST, must be one of the viewer's own hosts with its port.
 */
function isViewerAction(req: ApiRequest, action: string, allowedHosts: ReadonlySet<string>): boolean {
  if (req.headers?.["x-factory-action"] !== action) {
    return false;
  }
  const origin = String(req.headers?.origin ?? "");
  if (!origin) {
    return true;
  }
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && allowedHosts.has(parsed.host.toLowerCase());
  } catch {
    return false;
  }
}

/** The viewer API; `allowedHosts` are the viewer's own `host:port` values, the only origins its actions accept. */
export function apiMiddleware(api: DataApi, allowedHosts: ReadonlySet<string>) {
  return async (req: ApiRequest, res: JsonResponse, next: () => unknown): Promise<unknown> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (req.method === "POST" && url.pathname === "/api/update") {
      if (!isViewerAction(req, "update", allowedHosts)) return send(403, { error: "update needs the viewer's own request" });
      try {
        return send(200, await api.update());
      } catch (error) {
        return send(409, { error: errorMessage(error) });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/projects") {
      if (!isViewerAction(req, "projects", allowedHosts)) return send(403, { error: "projects needs the viewer's own request" });
      try {
        return send(200, api.projectsAction(parseProjectsAction(await readBody(req))));
      } catch (error) {
        return send(400, { error: errorMessage(error) });
      }
    }
    const answerMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/answer$/);
    if (req.method === "POST" && answerMatch?.[1] !== undefined) {
      if (!isViewerAction(req, "answer", allowedHosts)) return send(403, { error: "an answer needs the viewer's own request" });
      try {
        return send(200, api.answer(answerMatch[1], url.searchParams.get("question") ?? "", url.searchParams.get("answer") ?? ""));
      } catch (error) {
        return send(409, { error: errorMessage(error) });
      }
    }
    if (req.method !== "GET") return next();
    try {
      if (url.pathname === "/api/stale") return send(200, api.stale());
      if (url.pathname === "/api/pending") return send(200, api.pending());
      if (url.pathname === "/api/workflows") return send(200, api.workflows());
      if (url.pathname === "/api/agents") return send(200, api.agents());
      if (url.pathname === "/api/config") return send(200, api.config());
      if (url.pathname === "/api/projects") return send(200, api.projects());
      const projectMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9][a-z0-9-]*)\/status$/);
      if (projectMatch?.[1] !== undefined) {
        const status = api.projectStatus(projectMatch[1]);
        return status ? send(200, status) : send(404, { error: "no finished status run for this project" });
      }
      if (url.pathname === "/api/runs") {
        await api.ensureDemo();
        return send(200, api.runs());
      }
      const match = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
      if (match?.[1] !== undefined) {
        const detail = api.run(match[1]);
        return detail ? send(200, detail) : send(404, { error: "run not found" });
      }
      return next();
    } catch (error) {
      console.error(`viewer API ${url.pathname} failed: ${errorMessage(error)}`);
      return send(500, { error: errorMessage(error) });
    }
  };
}
