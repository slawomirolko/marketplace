import fs from "node:fs";
import { loadWorkflowSpecs } from "../src/workflow-yaml.ts";
import path from "node:path";
import { Factory, errorMessage, runReport } from "../src/engine.ts";
import type { Coverage, FactoryConfigFile, Report, Run, WorkflowSpec } from "../src/types.ts";

const RUN_ID = /^r-[a-f0-9]{8}$/;

export interface DataApiOptions {
  factoryDir: string;
  dataDir: string;
  configFile: string;
  demo: boolean;
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
}

export interface RunDetail {
  run: Pick<Run, "runId" | "goal" | "status" | "config" | "answers" | "ledger" | "events" | "pendingQuestion">;
  report: Report;
}

export interface DataApi {
  dataDir: string;
  ensureDemo(): Promise<boolean>;
  workflows(): WorkflowSpec[];
  config(): FactoryConfigFile;
  runs(): RunListItem[];
  run(runId: string): RunDetail | null;
}

export interface ApiRequest {
  method?: string | undefined;
  url?: string | undefined;
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

export function createDataApi({ factoryDir, dataDir, configFile, demo }: DataApiOptions): DataApi {
  const runsDir = path.join(dataDir, "runs");

  function runFiles(): string[] {
    if (!fs.existsSync(runsDir)) return [];
    return fs.readdirSync(runsDir).filter((f) => RUN_ID.test(path.basename(f, ".json")));
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
      const dir = path.join(factoryDir, "workflows");
      return loadWorkflowSpecs(dir);
    },

    config() {
      return readJson(configFile) as FactoryConfigFile;
    },

    runs() {
      return runFiles()
        .map((f) => readJson(path.join(runsDir, f)) as Run)
        .map((run) => ({ run, report: runReport(run) }))
        .map(({ run, report }) => ({
          runId: run.runId,
          goal: run.goal,
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
      const file = path.join(runsDir, `${runId}.json`);
      if (!fs.existsSync(file)) return null;
      const run = readJson(file) as Run;
      const { runId: id, goal, status, config, answers, ledger, events, pendingQuestion } = run;
      return { run: { runId: id, goal, status, config, answers, ledger, events, pendingQuestion }, report: runReport(run) };
    },
  };
}

export function apiMiddleware(api: DataApi) {
  return async (req: ApiRequest, res: JsonResponse, next: () => unknown): Promise<unknown> => {
    if (req.method !== "GET") return next();
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    try {
      if (url.pathname === "/api/workflows") return send(200, api.workflows());
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
