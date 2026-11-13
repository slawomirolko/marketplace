import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Factory } from "../src/engine.ts";
import type { CliName, Run } from "../src/types.ts";
import { cliExecutor } from "../src/cli-backend.ts";

const clis = (process.argv[2] ?? "claude,opencode").split(",") as CliName[];
const repeats = Number(process.argv[3] ?? 3);
const tierModels = { low: "haiku", medium: "sonnet", high: "opus" };
const outFile = process.argv[4] ?? path.join(process.cwd(), "cli-matrix-results.json");

const dataDir = process.env.FACTORY_DATA_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "factory-cli-matrix-"));
const factory = new Factory(dataDir, { executors: { claude: cliExecutor("claude"), opencode: cliExecutor("opencode") } });

async function untilSettled(runId: string): Promise<Run> {
  for (;;) {
    const { run } = await factory.waitForChange(runId, 600000);
    const question = run.pendingQuestion;
    if (run.status === "waiting_for_user" && question) {
      factory.answer(runId, question.id, question.id === "q-budget-pause" ? "continue" : "extend");
      continue;
    }
    if (run.status !== "running") return run;
  }
}

const results: unknown[] = [];
for (const cli of clis) {
  for (let i = 1; i <= repeats; i += 1) {
    const started = Date.now();
    const { run } = factory.start("add a greeting function", `${cli}-${i}`);
    factory.confirm(run.runId, { backend: { kind: "cli", cli }, tierModels, budget: { maxCostUsd: 50 } });
    const finished = await untilSettled(run.runId);
    const report = factory.report(finished);
    const row = {
      cli,
      repeat: i,
      status: finished.status,
      error: finished.events.find((e) => e.type === "node_failed")?.error,
      durationSec: Math.round((Date.now() - started) / 1000),
      factoryCostUsd: report.cost.costUsd,
      harnessCostUsd: report.harnessCostUsd,
      byCostSource: report.byCostSource,
      byModel: report.byModel,
      ledger: finished.ledger.filter((r) => r.kind === "llm").map((r) => ({ node: r.nodePath, tier: r.tier, requested: r.requestedModel, model: r.model, in: r.inputTokens, out: r.outputTokens, cacheRead: r.cacheReadTokens, cacheWrite5m: r.cacheWrite5mTokens, cacheWrite1h: r.cacheWrite1hTokens, costUsd: r.costUsd, harnessCostUsd: r.harnessCostUsd, costSource: r.costSource, harnessTurns: r.harnessTurns })),
    };
    results.push(row);
    console.log(`${cli} #${i}: ${row.status} ${row.durationSec}s factory=$${row.factoryCostUsd} harness=$${row.harnessCostUsd} sources=${JSON.stringify(row.byCostSource)}${row.error ? " error=" + row.error : ""}`);
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  }
}
console.log(`results: ${outFile}`);
process.exit(0);
