import assert from "node:assert/strict";
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
const repoRoot = path.join(factoryDir, "..");
const REPO = process.env.FACTORY_REVIEW_REPO ?? "slawomirolko/marketplace";
const PR = Number(process.env.FACTORY_REVIEW_PR ?? 69);
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

test("a harness drives the YAML olko-review workflow over stdio in delegate mode, runs offered agents in parallel and every agent step is priced", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-delegate-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(await freePort()) } as Record<string, string>;
  const client = new Client({ name: "claude-code", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(factoryDir, "src", "stdio.ts")], env, stderr: "pipe" }));
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const asked: string[] = [];
  const batches: string[][] = [];
  const bashNodes = new Set<string>();
  try {
    const started = await call(client, "factory_start", { goal: `Review PR #${PR} in ${REPO}`, workflow: "olko-review", input: { repo: REPO, pr: PR, fresh: true } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call(client, "factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call(client, "factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions, `pendingWork for ${work.nodePath} carries the marketplace agent to run`);
        batches.push(items.map((w) => w.agentName));
        for (const work of items) if ((work.tools as string[]).includes("bash")) bashNodes.add(work.nodePath.split("/").at(-1));
        const results = await Promise.all(items.map((w) => runSubagent(w, { cwd: repoRoot })));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          submitted.push({ agentName: work.agentName, usage: result.usage });
          status = await call(client, "factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const id = status.pendingQuestion.id as string;
        asked.push(id);
        status = await call(client, "factory_answer", { runId, questionId: id, answer: id === "q-memory-missing" ? "continue" : "skip" });
      }
    }
    const report = await call(client, "factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    assert.ok(report.workflow.startsWith("olko-review@"));
    assert.ok(submitted.some((s) => s.agentName === "olko-review-bugs-lens"));
    assert.ok(submitted.some((s) => s.agentName === "olko-review-orchestrator"), "the orchestrator agent runs the route, scope, merge and rank steps");
    for (const node of ["route", "scope", "diff"]) assert.ok(bashNodes.has(node), `${node} runs gh and git through the agent: ${[...bashNodes].join(",")}`);
    assert.equal(asked[0], "q-memory-missing");
    assert.ok(asked.slice(1).every((id) => /^q-post-\d+$/.test(id)), asked.join(","));
    const lensBatch = batches.find((b) => b.includes("olko-review-bugs-lens"));
    assert.ok(lensBatch && lensBatch.length >= 2, `lens agents offered together: ${JSON.stringify(batches)}`);
    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.equal(agents.length, submitted.length);
    for (const agent of agents) {
      assert.equal(agent.costSource, "reported", JSON.stringify(agent));
      assert.ok(agent.costUsd > 0);
    }
    assert.equal(report.coverage.run.unknownSteps, 0);
    assert.equal(report.cost.tokens, submitted.reduce((sum, s) => sum + s.usage.inputTokens + s.usage.outputTokens, 0));
    assert.equal(report.cacheTokens, submitted.reduce((sum, s) => sum + s.usage.cacheReadTokens + s.usage.cacheWriteTokens, 0));
    console.log(JSON.stringify({ runId, batches, asked, costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
  }
});
