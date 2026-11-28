import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runSubagent, type SubagentResult } from "./delegate-subagent.ts";
import { callTool, startStdio, type Payload } from "./helpers/mcp.ts";
import { git } from "./helpers/processes.ts";
import { removeDir, tempDir } from "./helpers/temp.ts";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = process.env.FACTORY_SYNC_PROJECT;
const ARTIFACTS = (process.env.FACTORY_SYNC_ARTIFACTS ?? "olko-design-rules,olko-review-verifier,olko-e2e-acceptance-runner").split(",");
const MARKETPLACE = process.env.FACTORY_SYNC_MARKETPLACE ?? "slawomirolko/marketplace";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const TOOL_TIMEOUT = { timeoutMs: 120000 };

function snapshot(dir: string): Record<string, string> {
  return { branch: git(dir, "branch", "--show-current"), head: git(dir, "rev-parse", "HEAD"), status: git(dir, "status", "--porcelain"), branches: git(dir, "branch", "--list", "--format=%(refname:short)") };
}

test("a harness drives the YAML marketplace skill sync over stdio in delegate mode, honours per-node tools, and leave on every decision changes nothing", async () => {
  assert.ok(PROJECT, "set FACTORY_SYNC_PROJECT to the owner/name of a real project with .agents/skills and .opencode/agents");
  const root = tempDir("factory-sync-ts-", { real: true });
  const project = path.join(root, "project");
  const marketplace = path.join(root, "marketplace");
  execFileSync("gh", ["repo", "clone", PROJECT, project, "--", "--depth", "1"]);
  execFileSync("gh", ["repo", "clone", MARKETPLACE, marketplace, "--", "--depth", "50"]);
  const before = snapshot(marketplace);
  const session = await startStdio({ entry: path.join(factoryDir, "src", "stdio.ts") });
  const { client } = session;
  const call = (name: string, args: Record<string, unknown>) => callTool(client, name, args, TOOL_TIMEOUT);
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const offered: Payload[] = [];
  const asked: Payload[] = [];
  try {
    const started = await call("factory_start", { goal: "Sync project-local skills and agents to the marketplace", workflow: "olko-marketplace-skill-sync", input: { project, marketplace, artifacts: ARTIFACTS } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call("factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call("factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions && Array.isArray(work.tools) && Array.isArray(work.dirs), `pendingWork for ${work.nodePath} carries agent, tools and dirs`);
        offered.push(...items);
        const results = await Promise.all(items.map((w) => runSubagent(w, { cwd: (w.cwd as string | undefined) ?? project })));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          submitted.push({ agentName: work.agentName, usage: result.usage });
          status = await call("factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const question = status.pendingQuestion as Payload;
        asked.push(question);
        status = await call("factory_answer", { runId, questionId: question.id, answer: question.allowed?.includes("leave") ? "leave" : "stop" });
      }
    }
    const report = await call("factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    assert.ok(report.workflow.startsWith("olko-marketplace-skill-sync@"));
    const compare = offered.filter((w) => w.agentName === "olko-marketplace-skill-sync-comparator");
    assert.deepEqual(compare.map((w) => w.agentId).sort(), [...ARTIFACTS].sort());
    assert.ok(compare.every((w) => w.tools.join() === "read,bash" && w.dirs.includes(marketplace)), JSON.stringify(compare.map((w) => [w.tools, w.dirs])));
    const stepOf = (w: Payload) => String(w.nodePath).split("/").at(-1) ?? "";
    const manager = offered.filter((w) => w.agentName === "olko-marketplace-skill-sync-manager");
    for (const step of ["resolve-path", "memory", "safe-source", "discover", "versions", "rows", "plan", "report"]) assert.ok(manager.some((w) => stepOf(w) === step), `the sync manager runs ${step}: ${manager.map(stepOf).join()}`);
    assert.ok(manager.every((w) => !w.tools.includes("edit")), "with leave on every decision the sync manager only reads");
    assert.ok(!offered.some((w) => ["apply", "validate", "publish", "install", "memory-save"].includes(stepOf(w))), "leave on every decision applies, publishes and installs nothing");
    const adapt = offered.filter((w) => w.agentName === "olko-adapt-to-marketplace");
    assert.ok(adapt.every((w) => w.tools.includes("edit") && /--local-only/.test(w.prompt)), "skill node offers write access and local-only mode");
    const decisions = asked.filter((q) => q.id.startsWith("q-sync-"));
    assert.ok(decisions.every((q) => q.allowed.includes("leave")));
    assert.deepEqual(snapshot(marketplace), before);
    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.equal(agents.length, submitted.length);
    for (const agent of agents) assert.equal(agent.costSource, "reported", JSON.stringify(agent));
    assert.equal(report.coverage.run.unknownSteps, 0);
    console.log(JSON.stringify({ runId, offered: offered.map((w) => w.agentId), asked: asked.map((q) => q.id), costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await session.close();
    removeDir(root);
  }
});
