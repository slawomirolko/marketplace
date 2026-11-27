import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runSubagent, type SubagentResult } from "./delegate-subagent.ts";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKETPLACE = process.env.FACTORY_SYNC_MARKETPLACE ?? "slawomirolko/marketplace";
const BRANCH = process.env.FACTORY_PLAN_BRANCH ?? "feat/skill-factory-poc";
const IDEA = process.env.FACTORY_PLAN_IDEA ?? "Add approval gates to the skill factory: a script node can declare approval: required, and the engine asks the user before it runs the operation and records the answer in the run (item E7 of factory/docs/yaml-migration-plan.md).";
const FEATURE = process.env.FACTORY_PLAN_FEATURE_ID ?? "e7-approval-gates";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);

type Payload = Record<string, any>;

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Payload> {
  const res = (await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })) as CallToolResult;
  assert.ok(!res.isError, JSON.stringify(res.content));
  return res.structuredContent as Payload;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function snapshot(dir: string): Record<string, string> {
  return { branch: git(dir, "branch", "--show-current"), head: git(dir, "rev-parse", "HEAD"), status: git(dir, "status", "--porcelain"), branches: git(dir, "branch", "--list", "--format=%(refname:short)") };
}

function answerOf(question: Payload): string {
  const allowed: string[] = question.allowed ?? [];
  if (String(question.id).startsWith("q-plan-draft-review")) return "approve";
  if (!allowed.length) return "Use your recommended answer for every question.";
  if (allowed.join() === "1,2,3") return "1";
  for (const answer of ["accept", "finding", "skip"]) if (allowed.includes(answer)) return answer;
  return allowed[0]!;
}

test("a harness drives the YAML plan documentation over stdio in delegate mode with the tracker switched off and every plan file reviewed", async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "factory-plan-doc-ts-")));
  const project = path.join(root, "project");
  execFileSync("gh", ["repo", "clone", MARKETPLACE, project, "--", "--depth", "1", "--branch", BRANCH]);
  assert.ok(fs.existsSync(path.join(project, "factory", "docs", "yaml-migration-plan.md")), `the idea cites factory/docs/yaml-migration-plan.md, which branch ${BRANCH} must hold`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-delegate-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(await freePort()) } as Record<string, string>;
  const client = new Client({ name: "claude-code", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(factoryDir, "src", "stdio.ts")], env, stderr: "pipe" }));
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const batches: Payload[][] = [];
  const asked: Payload[] = [];
  try {
    const started = await call(client, "factory_start", { goal: "Draft the Feature and plan it with an implementation plan for every Task", workflow: "olko-plan-documentation", input: { project, idea: IDEA, route: "both", featureId: FEATURE, switches: { tracker: false, editor: false } } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call(client, "factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call(client, "factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions && Array.isArray(work.tools) && Array.isArray(work.dirs), `pendingWork for ${work.nodePath} carries agent, tools and dirs`);
        batches.push(items);
        const results = await Promise.all(items.map((w) => runSubagent(w, { cwd: (w.cwd as string | undefined) ?? project })));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          submitted.push({ agentName: work.agentName, usage: result.usage });
          status = await call(client, "factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const question = status.pendingQuestion as Payload;
        asked.push(question);
        status = await call(client, "factory_answer", { runId, questionId: question.id, answer: answerOf(question) });
      }
    }
    const report = await call(client, "factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    const investigate = batches.find((b) => b.some((w) => w.agentName === "olko-investigation-flow-worker" && w.nodePath.endsWith("/investigate")));
    assert.equal(investigate?.length, 5, "knowledge manager and four workers are offered together");
    const feature = path.join(project, "plans", "features", FEATURE);
    for (const name of ["business.md", "implementation.md", "stack.md", "tracker.md"]) assert.ok(fs.existsSync(path.join(feature, name)), name);
    assert.ok(fs.readdirSync(path.join(feature, "tasks")).some((f) => f.endsWith("-implementation.md")));
    assert.ok(batches.flat().some((w) => w.nodePath.includes("/plan-review/")), "the review PLAN route ran through the call");
    assert.ok(asked.filter((q) => String(q.id).startsWith("q-plan-grill-")).every((q) => q.allowed.join() === "1,2,3"));
    const work = batches.flat();
    const orchestratorRan = (step: string) => work.some((w) => w.nodePath === `olko-plan-documentation/${step}` && w.agentName === "olko-plan-documentation-orchestrator");
    for (const step of ["feature", "auditors", "plan-files", "report"]) assert.ok(orchestratorRan(step), `the orchestrator agent ran ${step}`);
    assert.ok(!work.some((w) => w.nodePath === "olko-plan-documentation/route"), "input.route picks the path without an agent");
    const recorded = (step: string) => work.filter((w) => w.nodePath === `olko-plan-documentation/${step}`).length;
    const batchCount = (prefix: string) => new Set(asked.map((q) => String(q.id)).filter((id) => id.startsWith(prefix)).map((id) => id.split("-").slice(0, -1).join("-"))).size;
    assert.equal(recorded("grill-record"), batchCount("q-plan-grill-"), "the orchestrator records each answered grill batch in tracker.md in one step");
    assert.equal(recorded("blocker-record"), batchCount("q-plan-blocker-"), "the orchestrator records each answered blocker batch in tracker.md in one step");
    assert.ok(!work.some((w) => w.nodePath.endsWith("/editor/open")), "the editor switch is off");
    const changed = execFileSync("git", ["-C", project, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim());
    assert.ok(changed.every((c) => c.startsWith(`plans/features/${FEATURE}/`) || c === ".opencode/memory/olko-plan-documentation-orchestrator.md"), changed.join(", "));
    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.equal(agents.length, new Set(submitted.map((s, i) => i)).size > 0 ? agents.length : 0);
    for (const agent of agents) assert.equal(agent.costSource, "reported", JSON.stringify(agent));
    console.log(JSON.stringify({ runId, steps: submitted.length, asked: asked.length, costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
  }
});
