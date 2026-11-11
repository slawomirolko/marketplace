import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
const repoRoot = path.join(factoryDir, "..");
const REPO = process.env.FACTORY_REVIEW_REPO ?? "slawomirolko/marketplace";
const PR = Number(process.env.FACTORY_REVIEW_PR ?? 69);
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

function runSubagent(agentName: string, model: string, prompt: string): Promise<SubagentResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--agent", agentName, "--model", model, "--output-format", "json", "--allowedTools", "Read,Grep,Glob,Skill", "--max-turns", "40"], { cwd: repoRoot, shell: process.platform === "win32" });
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
    child.stdin.end(prompt);
  });
}

test("a harness drives the YAML olko-review workflow over stdio in delegate mode and every agent step is priced", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-delegate-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(await freePort()) } as Record<string, string>;
  const client = new Client({ name: "claude-code", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(factoryDir, "src", "stdio.ts")], env, stderr: "pipe" }));
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const asked: string[] = [];
  try {
    const started = await call(client, "factory_start", { goal: `Review PR #${PR} in ${REPO}`, workflow: "olko-review", input: { repo: REPO, pr: PR } });
    const runId = started.runId as string;
    let status = await call(client, "factory_confirm", { runId });
    while (!ENDED.has(status.status)) {
      status = await call(client, "factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const work = status.pendingWork;
        assert.ok(work.agentName, `pendingWork for ${work.nodePath} names the marketplace agent to run`);
        const result = await runSubagent(work.agentName, work.model, work.prompt);
        submitted.push({ agentName: work.agentName, usage: result.usage });
        status = await call(client, "factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
      } else if (status.status === "waiting_for_user") {
        asked.push(status.pendingQuestion.id);
        status = await call(client, "factory_answer", { runId, questionId: status.pendingQuestion.id, answer: "skip" });
      }
    }
    const report = await call(client, "factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    assert.ok(report.workflow.startsWith("olko-review@"));
    assert.ok(submitted.some((s) => s.agentName === "olko-review-bugs-lens"));
    assert.deepEqual(asked.filter((id) => id !== "q-post-comments"), []);
    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.equal(agents.length, submitted.length);
    for (const agent of agents) {
      assert.equal(agent.costSource, "reported", JSON.stringify(agent));
      assert.ok(agent.costUsd > 0);
    }
    assert.equal(report.coverage.run.unknownSteps, 0);
    assert.equal(report.cost.tokens, submitted.reduce((sum, s) => sum + s.usage.inputTokens + s.usage.outputTokens, 0));
    assert.equal(report.cacheTokens, submitted.reduce((sum, s) => sum + s.usage.cacheReadTokens + s.usage.cacheWriteTokens, 0));
    console.log(JSON.stringify({ runId, agents: submitted.map((s) => s.agentName), asked, costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
  }
});
