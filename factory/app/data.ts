import fs from "node:fs";
import { loadWorkflowSpecs } from "../src/workflow-yaml.ts";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Factory, errorMessage, runReport } from "../src/engine.ts";
import { homeDataDir, readSources } from "../src/paths.ts";
import { describeAgent, marketplaceDir } from "../src/marketplace-agents.ts";
import { readQuestions } from "../src/questions.ts";
import type { AskedQuestion } from "../src/questions.ts";
import { memoryLayerOf } from "../src/config.ts";
import { standaloneNames, workflowsThatRan } from "../src/standalone.ts";
import { readLock, scanMarketplace, updateMarketplace } from "../src/sources-lock.ts";
import type { MarketplaceScan, UpdateResult } from "../src/sources-lock.ts";
import { execFileSync } from "node:child_process";
import { hostExec } from "../src/cli-backend.ts";
import type { AgentInfo } from "../src/marketplace-agents.ts";
import type { Coverage, FactoryConfigFile, Report, Run, WorkflowSpec } from "../src/types.ts";

const RUN_ID = /^r-[a-f0-9]{8}$/;

export interface DataApiOptions {
  factoryDir: string;
  dataDir: string;
  configFile: string;
  demo: boolean;
  /** The factory of this process. Only its own runs can be answered from the viewer. */
  factory?: Factory;
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
}

export interface RunDetail {
  run: Pick<Run, "runId" | "goal" | "status" | "config" | "answers" | "ledger" | "events" | "pendingQuestion" | "pendingWorkItems">;
  report: Report;
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
  pending(): PendingDecision[];
  answer(runId: string, questionId: string, answer: string): PendingDecision[];
}

export interface ApiRequest {
  method?: string | undefined;
  url?: string | undefined;
  headers?: Record<string, string | string[] | undefined>;
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
      return { run: { runId: id, goal, status, config, answers, ledger, events, pendingQuestion, pendingWorkItems }, report: runReport(run), questions: readQuestions(path.dirname(path.dirname(file)), id) };
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
  };
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
  return scanMarketplace(specs, readLock(), marketplace, head, (name) => describeAgent(name) !== null);
}

export function apiMiddleware(api: DataApi) {
  return async (req: ApiRequest, res: JsonResponse, next: () => unknown): Promise<unknown> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    if (req.method === "POST" && url.pathname === "/api/update") {
      const origin = String(req.headers?.origin ?? "");
      if (req.headers?.["x-factory-action"] !== "update" || (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) return send(403, { error: "update needs the viewer's own request" });
      try {
        return send(200, await api.update());
      } catch (error) {
        return send(409, { error: errorMessage(error) });
      }
    }
    const answerMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/answer$/);
    if (req.method === "POST" && answerMatch?.[1] !== undefined) {
      const origin = String(req.headers?.origin ?? "");
      if (req.headers?.["x-factory-action"] !== "answer" || (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) return send(403, { error: "an answer needs the viewer's own request" });
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
      return send(500, { error: errorMessage(error) });
    }
  };
}
