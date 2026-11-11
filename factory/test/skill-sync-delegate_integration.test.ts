import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = process.env.FACTORY_SYNC_PROJECT;
const ARTIFACTS = (process.env.FACTORY_SYNC_ARTIFACTS ?? "olko-design-rules,olko-review-verifier,olko-e2e-acceptance-runner").split(",");
const MARKETPLACE = process.env.FACTORY_SYNC_MARKETPLACE ?? "slawomirolko/marketplace";
const TOOLS: Record<string, string> = { read: "Read,Grep,Glob", edit: "Edit,Write", bash: "Bash" };
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);

type Payload = Record<string, any>;

interface SubagentResult {
  output: string;
  usage: { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

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

function runSubagent(work: Payload, cwd: string): Promise<SubagentResult> {
  const agentsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-agent-")), "agents.json");
  const allowed = (work.tools as string[]).map((t) => TOOLS[t]).join(",");
  fs.writeFileSync(agentsFile, JSON.stringify({ [work.agentName]: { description: work.agentDescription, prompt: work.agentInstructions, tools: allowed.split(",") } }));
  const dirs = (work.dirs as string[]).flatMap((d) => ["--add-dir", d]);
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--agents", agentsFile, "--agent", work.agentName, "--model", work.model, "--output-format", "json", "--allowedTools", allowed, ...((work.tools as string[]).includes("edit") ? ["--permission-mode", "acceptEdits"] : []), ...dirs, "--max-turns", "40"], { cwd, shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(-500)}`));
      const out = JSON.parse(stdout) as { result: string; modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }> };
      const [usedModel, usage] = Object.entries(out.modelUsage).sort((a, b) => b[1].outputTokens - a[1].outputTokens)[0]!;
      resolve({ output: out.result, usage: { model: usedModel, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadInputTokens, cacheWriteTokens: usage.cacheCreationInputTokens } });
    });
    child.stdin.end(work.prompt);
  });
}

test("a harness drives the YAML marketplace skill sync over stdio in delegate mode, honours per-node tools, and leave on every decision changes nothing", async () => {
  assert.ok(PROJECT, "set FACTORY_SYNC_PROJECT to the owner/name of a real project with .agents/skills and .opencode/agents");
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "factory-sync-ts-")));
  const project = path.join(root, "project");
  const marketplace = path.join(root, "marketplace");
  execFileSync("gh", ["repo", "clone", PROJECT, project, "--", "--depth", "1"]);
  execFileSync("gh", ["repo", "clone", MARKETPLACE, marketplace, "--", "--depth", "50"]);
  const before = snapshot(marketplace);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-delegate-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(await freePort()) } as Record<string, string>;
  const client = new Client({ name: "claude-code", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(factoryDir, "src", "stdio.ts")], env, stderr: "pipe" }));
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const offered: Payload[] = [];
  const asked: Payload[] = [];
  try {
    const started = await call(client, "factory_start", { goal: "Sync project-local skills and agents to the marketplace", workflow: "olko-marketplace-skill-sync", input: { project, marketplace, artifacts: ARTIFACTS } });
    const runId = started.runId as string;
    let status = await call(client, "factory_confirm", { runId });
    while (!ENDED.has(status.status)) {
      status = await call(client, "factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions && Array.isArray(work.tools) && Array.isArray(work.dirs), `pendingWork for ${work.nodePath} carries agent, tools and dirs`);
        offered.push(...items);
        const results = await Promise.all(items.map((w) => runSubagent(w, project)));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          submitted.push({ agentName: work.agentName, usage: result.usage });
          status = await call(client, "factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const question = status.pendingQuestion as Payload;
        asked.push(question);
        status = await call(client, "factory_answer", { runId, questionId: question.id, answer: question.allowed?.includes("leave") ? "leave" : "stop" });
      }
    }
    const report = await call(client, "factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    assert.ok(report.workflow.startsWith("olko-marketplace-skill-sync@"));
    const compare = offered.filter((w) => w.agentName === "olko-marketplace-skill-sync-comparator");
    assert.deepEqual(compare.map((w) => w.agentId).sort(), [...ARTIFACTS].sort());
    assert.ok(compare.every((w) => w.tools.join() === "read" && w.dirs.includes(marketplace)), JSON.stringify(compare.map((w) => [w.tools, w.dirs])));
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
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
  }
});
