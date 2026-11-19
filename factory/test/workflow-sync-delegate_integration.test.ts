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
const marketplaceDir = path.join(factoryDir, "..");
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const SOURCES = [
  "agents/opencode/olko-workflow-sync-orchestrator.md",
  "agents/opencode/olko-workflow-mapper.md",
  "agents/opencode/olko-workflow-verifier.md",
  "skills/software-factory/olko-factory-workflow-sync/SKILL.md",
  "skills/software-factory/olko-factory-workflow-yaml/SKILL.md",
];

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
  return execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" }).trim();
}

test("a harness drives the workflow sync over stdio: the orchestrator runs the skill script, the mapper ends its round with it, and approve locks the verified workflow", async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "factory-wfsync-")));
  const marketplace = path.join(root, "marketplace");
  for (const file of SOURCES) {
    fs.mkdirSync(path.dirname(path.join(marketplace, file)), { recursive: true });
    fs.copyFileSync(path.join(marketplaceDir, file), path.join(marketplace, file));
  }
  git(root, "init", "-q", "-b", "main", marketplace);
  git(marketplace, "add", ".");
  git(marketplace, "commit", "-q", "-m", "sources");
  const workflows = path.join(root, "factory", "workflows");
  fs.mkdirSync(workflows, { recursive: true });
  fs.copyFileSync(path.join(factoryDir, "workflows", "olko-workflow-sync.yaml"), path.join(workflows, "olko-workflow-sync.yaml"));
  execFileSync(process.execPath, [path.join(factoryDir, "src", "sources-lock.ts"), "lock", "--workflows", workflows, "--marketplace", marketplace, "--names", "olko-workflow-sync"]);
  const lockFile = path.join(root, "factory", "workflows.lock.json");
  const verifier = path.join(marketplace, "agents", "opencode", "olko-workflow-verifier.md");
  fs.writeFileSync(verifier, fs.readFileSync(verifier, "utf8").replace("- Branch descriptions match their conditions;", "- Every node that runs a skill script names the command in its prompt.\n- Branch descriptions match their conditions;"));
  git(marketplace, "commit", "-q", "-am", "verifier rule");
  const head = git(marketplace, "rev-parse", "HEAD");
  const realYaml = fs.readFileSync(path.join(factoryDir, "workflows", "olko-workflow-sync.yaml"), "utf8");
  const realLock = fs.readFileSync(path.join(factoryDir, "workflows.lock.json"), "utf8");

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-delegate-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(await freePort()) } as Record<string, string>;
  const client = new Client({ name: "claude-code", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(factoryDir, "src", "stdio.ts")], env, stderr: "pipe" }));
  const offered: Payload[] = [];
  const asked: Payload[] = [];
  try {
    const started = await call(client, "factory_start", { goal: "Sync the factory workflows with the marketplace", workflow: "olko-workflow-sync", input: { marketplace, workflowsDir: workflows } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call(client, "factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call(client, "factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        offered.push(...items);
        const results = await Promise.all(items.map((w) => runSubagent(w, { cwd: root })));
        for (const [i, work] of items.entries()) {
          status = await call(client, "factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: results[i]!.output, usage: results[i]!.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const question = status.pendingQuestion as Payload;
        asked.push(question);
        const answer = question.allowed?.includes("approve") ? "approve" : question.allowed?.includes("continue") ? "continue" : "skip";
        status = await call(client, "factory_answer", { runId, questionId: question.id, answer });
      }
    }
    const report = await call(client, "factory_report", { runId });
    assert.equal(report.status, "done", JSON.stringify(report));
    const stepOf = (w: Payload) => String(w.nodePath).split("/").at(-1) ?? "";
    const orchestrator = offered.filter((w) => w.agentName === "olko-workflow-sync-orchestrator");
    assert.deepEqual(orchestrator.map(stepOf), ["scan", "diff", "finish"]);
    assert.ok(orchestrator.every((w) => w.tools.join() === "read,bash" && /workflow-sync/.test(w.prompt)), JSON.stringify(orchestrator.map((w) => w.tools)));
    const mapper = offered.filter((w) => w.agentName === "olko-workflow-mapper");
    assert.ok(mapper.length >= 1 && mapper.length <= 3);
    assert.ok(mapper.every((w) => w.tools.includes("edit") && /round/.test(w.prompt) && /--source agents\/opencode\/olko-workflow-verifier\.md/.test(w.prompt)));
    assert.equal(offered.filter((w) => w.agentName === "olko-workflow-verifier").length, mapper.length);
    assert.ok(asked.some((q) => q.id === "q-wfsync-apply"));

    const runFile = fs.readdirSync(path.join(dataDir, "runs")).find((f) => f.startsWith(runId));
    const state = JSON.parse(fs.readFileSync(path.join(dataDir, "runs", runFile!), "utf8")).state;
    const stateDir = state.scan.scan.stateDir as string;
    const sync = JSON.parse(fs.readFileSync(path.join(stateDir, "sync.json"), "utf8"));
    assert.deepEqual(sync.items.map((i: Payload) => [i.kind, i.source]), [["changed", "agents/opencode/olko-workflow-verifier.md"]]);
    assert.equal(sync.rounds["agents/opencode/olko-workflow-verifier.md"], mapper.length);
    const verdict = sync.results["agents/opencode/olko-workflow-verifier.md"].verdict;
    const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (verdict === "pass") assert.equal(lock["olko-workflow-sync"].commit, head);
    else assert.notEqual(lock["olko-workflow-sync"].commit, head);
    assert.equal(fs.readFileSync(path.join(factoryDir, "workflows", "olko-workflow-sync.yaml"), "utf8"), realYaml);
    assert.equal(fs.readFileSync(path.join(factoryDir, "workflows.lock.json"), "utf8"), realLock);
    console.log(JSON.stringify({ runId, verdict, rounds: mapper.length, asked: asked.map((q) => q.id), costUsd: report.cost.costUsd, report: state.finish?.finish?.report }));
  } finally {
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
  }
});
