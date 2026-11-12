import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
const TARGET = process.env.FACTORY_CLAUDE_SYNC_TARGET ?? "anthropics/claude-plugins-official";
const ARTIFACTS = (process.env.FACTORY_CLAUDE_SYNC_ARTIFACTS ?? "olko-design-rules,olko-review-verifier,frontend-design").split(",");
const MARKETPLACE = process.env.FACTORY_SYNC_MARKETPLACE ?? "slawomirolko/marketplace";
const REAL_SYNC_HOME = process.env.OLKO_SYNC_HOME ?? path.join(os.homedir(), ".olko-sync");
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

function leakTerms(): string[] {
  const file = path.join(REAL_SYNC_HOME, "targets.json");
  const terms = fs.existsSync(file) ? ((JSON.parse(fs.readFileSync(file, "utf8")).leakTerms ?? []) as string[]) : [];
  return [...terms, ...(process.env.FACTORY_LEAK_TERMS ?? "").split(",").filter(Boolean)].map((t) => t.toLowerCase());
}

function filesOf(entry: string): string[] {
  return fs.statSync(entry).isFile() ? [entry] : (fs.readdirSync(entry, { recursive: true }) as string[]).map((f) => path.join(entry, f)).filter((f) => fs.statSync(f).isFile());
}

function copyUserStore(destination: string, terms: string[]): void {
  for (const kind of ["skills", "agents"]) {
    const source = path.join(os.homedir(), ".claude", kind);
    fs.mkdirSync(path.join(destination, kind), { recursive: true });
    for (const name of fs.existsSync(source) ? fs.readdirSync(source) : []) {
      const entry = path.join(source, name);
      const mentions = (text: string) => terms.some((t) => text.toLowerCase().includes(t));
      if (mentions(name) || filesOf(entry).some((f) => mentions(fs.readFileSync(f, "utf8")))) continue;
      fs.cpSync(entry, path.join(destination, kind, name), { recursive: true, dereference: true });
    }
  }
}

function treeHash(root: string): string {
  const hash = createHash("sha256");
  for (const f of filesOf(root).sort()) hash.update(path.relative(root, f)).update(fs.readFileSync(f));
  return hash.digest("hex");
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

test("a harness drives the YAML claude sync over stdio in delegate mode: three inventories at once, only requested capabilities compared, leave changes no store", async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "factory-claude-sync-ts-")));
  const [target, olko, user, state] = ["target", "olko", "user", "state"].map((d) => path.join(root, d)) as [string, string, string, string];
  execFileSync("gh", ["repo", "clone", TARGET, target, "--", "--depth", "50"]);
  execFileSync("gh", ["repo", "clone", MARKETPLACE, olko, "--", "--depth", "50"]);
  copyUserStore(user, leakTerms());
  const before = { target: snapshot(target), olko: snapshot(olko), user: treeHash(user) };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-delegate-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(await freePort()) } as Record<string, string>;
  const client = new Client({ name: "claude-code", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(factoryDir, "src", "stdio.ts")], env, stderr: "pipe" }));
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const batches: Payload[][] = [];
  const asked: Payload[] = [];
  try {
    const started = await call(client, "factory_start", { goal: "Sync skills and agents between a Claude marketplace, Olko and the user scope", workflow: "olko-claude-sync", input: { target, targetName: "public-plugins", olko, user, stateDir: state, artifacts: ARTIFACTS } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call(client, "factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call(client, "factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions && Array.isArray(work.tools) && Array.isArray(work.dirs), `pendingWork for ${work.nodePath} carries agent, tools and dirs`);
        batches.push(items);
        const results = await Promise.all(items.map((w) => runSubagent(w, olko)));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          submitted.push({ agentName: work.agentName, usage: result.usage });
          status = await call(client, "factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const question = status.pendingQuestion as Payload;
        asked.push(question);
        const answer = question.id === "q-claude-sync-leak" ? "none" : question.id === "q-claude-sync-consolidate" ? "skip" : question.id.startsWith("q-claude-sync-probable-") ? "confirm" : question.allowed?.includes("leave") ? "leave" : "stop";
        status = await call(client, "factory_answer", { runId, questionId: question.id, answer });
      }
    }
    const report = await call(client, "factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    const inventory = batches.find((b) => b.some((w) => w.agentName === "olko-claude-sync-inventory"));
    assert.deepEqual(inventory?.map((w) => w.agentId).sort(), ["olko", "target", "user"]);
    assert.ok(inventory?.every((w) => w.agentInstructions.includes("olko-sync-state")), "plugin agents carry their preloaded skill from the marketplace");
    const compared = batches.flat().filter((w) => w.agentName === "olko-claude-sync-comparator");
    assert.ok(compared.length <= ARTIFACTS.length, JSON.stringify(compared.map((w) => w.agentId)));
    assert.ok(asked.filter((q) => /^q-claude-sync-\d+$/.test(q.id)).every((q) => q.allowed.includes("leave")));
    assert.deepEqual({ target: snapshot(target), olko: snapshot(olko), user: treeHash(user) }, before);
    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.equal(agents.length, submitted.length);
    for (const agent of agents) assert.equal(agent.costSource, "reported", JSON.stringify(agent));
    console.log(JSON.stringify({ runId, batches: batches.map((b) => b.map((w) => w.agentId)), asked: asked.map((q) => q.id), costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
  }
});
