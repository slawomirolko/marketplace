import fs from "node:fs";
import path from "node:path";
import { Factory, runReport } from "../src/engine.mjs";

const RUN_ID = /^r-[a-f0-9]{8}$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function finishFakeRun(factory, goal) {
  const { run } = factory.start(goal);
  factory.confirm(run.runId, { backend: { kind: "fake" } });
  for (;;) {
    const { run: current } = await factory.waitForChange(run.runId, 30000);
    if (current.status === "waiting_for_user") {
      factory.answer(run.runId, current.pendingQuestion.id, current.pendingQuestion.id === "q-budget-pause" ? "continue" : "extend");
      continue;
    }
    if (current.status !== "running") return current;
  }
}

export function createDataApi({ factoryDir, dataDir, configFile, demo }) {
  const runsDir = path.join(dataDir, "runs");

  function runFiles() {
    if (!fs.existsSync(runsDir)) return [];
    return fs.readdirSync(runsDir).filter((f) => RUN_ID.test(path.basename(f, ".json")));
  }

  return {
    dataDir,

    async ensureDemo() {
      if (!demo || runFiles().length > 0) return false;
      await finishFakeRun(new Factory(dataDir), "add a greeting function (demo run, fake model)");
      return true;
    },

    workflows() {
      const dir = path.join(factoryDir, "workflows");
      return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(dir, f)));
    },

    config() {
      return readJson(configFile);
    },

    runs() {
      return runFiles()
        .map((f) => readJson(path.join(runsDir, f)))
        .map((run) => ({
          runId: run.runId,
          goal: run.goal,
          status: run.status,
          createdAt: run.events[0]?.at ?? null,
          costUsd: runReport(run).cost.costUsd,
          harness: run.config?.backend?.kind === "cli" ? run.config.backend.cli : run.config?.backend?.kind ?? null,
          requestedModels: [...new Set(Object.values(run.config?.tiers ?? {}))],
          usedModels: [...new Set(run.ledger.filter((r) => r.kind === "llm" && r.model).map((r) => r.model))],
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    run(runId) {
      if (!RUN_ID.test(runId)) return null;
      const file = path.join(runsDir, `${runId}.json`);
      if (!fs.existsSync(file)) return null;
      const run = readJson(file);
      const { runId: id, goal, status, config, answers, ledger, events, pendingQuestion } = run;
      return { run: { runId: id, goal, status, config, answers, ledger, events, pendingQuestion }, report: runReport(run) };
    },
  };
}

export function apiMiddleware(api) {
  return async (req, res, next) => {
    if (req.method !== "GET") return next();
    const url = new URL(req.url, "http://localhost");
    const send = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    try {
      if (url.pathname === "/api/workflows") return send(200, api.workflows());
      if (url.pathname === "/api/config") return send(200, api.config());
      if (url.pathname === "/api/runs") {
        await api.ensureDemo();
        return send(200, api.runs());
      }
      const match = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
      if (match) {
        const detail = api.run(match[1]);
        return detail ? send(200, detail) : send(404, { error: "run not found" });
      }
      return next();
    } catch (error) {
      return send(500, { error: error.message });
    }
  };
}
