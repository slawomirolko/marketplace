import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Factory } from "../src/engine.mjs";
import { cliExecutor, hostExec } from "./cli-backend.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pr = Number(process.argv[2]);
const model = process.argv[3] ?? "opencode/deepseek-v4.1-flash-free";
const repo = process.argv[4] ?? "slawomirolko/marketplace";
if (!Number.isInteger(pr)) {
  console.error("usage: node factory/host/review-run.mjs <pr-number> [model] [owner/repo]");
  process.exit(2);
}

const agentConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agents-"));
fs.mkdirSync(path.join(agentConfigDir, "agents"));
const agentsDir = path.join(repoRoot, "agents", "opencode");
for (const file of fs.readdirSync(agentsDir).filter((f) => /^olko-review-.+\.md$/.test(f))) {
  fs.copyFileSync(path.join(agentsDir, file), path.join(agentConfigDir, "agents", file));
}

const dataDir = process.env.FACTORY_DATA_DIR ?? path.join(repoRoot, "factory", ".viewer-data");
const factory = new Factory(dataDir, { executors: { opencode: cliExecutor("opencode"), exec: hostExec } });
const { run } = factory.start(`Review PR #${pr} in ${repo}`, undefined, { workflow: "olko-review", input: { repo, pr, cwd: repoRoot, agentConfigDir } });
factory.confirm(run.runId, { backend: { kind: "cli", cli: "opencode" }, tierModels: { low: model, medium: model, high: model }, budget: { maxCostUsd: 20 } });

for (;;) {
  const { run: current } = await factory.waitForChange(run.runId, 900000);
  if (current.status === "running") continue;
  const report = factory.report(current);
  const failure = current.events.find((e) => e.type === "node_failed" || e.type === "run_failed");
  console.log(`run ${current.runId}: ${current.status}${failure ? ` (${failure.node ?? ""} ${failure.error})` : ""}`);
  console.log(`cost $${report.cost.costUsd} · ${report.cost.tokens} tokens + ${report.cacheTokens} cache · sources ${JSON.stringify(report.byCostSource)}`);
  const final = current.ledger.findLast((r) => r.nodePath === "olko-review/rank");
  if (final?.output) console.log(`\n${final.output}`);
  fs.rmSync(agentConfigDir, { recursive: true, force: true });
  process.exit(current.status === "done" ? 0 : 1);
}
