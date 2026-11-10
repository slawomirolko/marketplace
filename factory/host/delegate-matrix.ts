import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { priceUsage } from "../src/prices.ts";
import type { PricedUsage } from "../src/prices.ts";
import type { Run, TokenCounts } from "../src/types.ts";
import { opencodeSessionUsage } from "./cli-backend.ts";

interface PilotSpawn {
  code: number | null;
  stdout: string;
  stderr: string;
  durationSec: number;
}

interface PilotDirs {
  claudeDir: string;
  opencodeDir: string;
}

interface PilotResult {
  ok: boolean;
  text: string;
  pilotCostUsd?: number | null | undefined;
  pilotTurns?: number | undefined;
  durationSec: number;
}

interface PilotEvent {
  type?: string;
  error?: unknown;
  part?: { type?: string; text?: string };
}

interface MatrixNode {
  node: string;
  tier: string | null;
  model: string | null;
  submitted: { totalTokens: number | null | undefined; inputTokens: number | null; outputTokens: number | null; childSessionId: string | null | undefined };
  costSourceAsSubmitted: string;
  costUsdAsSubmitted: number | null;
  costSourceAfterEnrichment: string;
  costUsdAfterEnrichment: number | null;
}

interface MatrixRow extends PilotResult {
  pilot: string;
  repeat: number;
  key: string;
  runId?: string;
  runStatus: string;
  steps?: number;
  nodes: MatrixNode[];
}

const [, , pilotsArg = "claude,opencode", repeatsArg = "3", workRoot, container = "skill-factory-poc"] = process.argv;
const pilots = pilotsArg.split(",");
const repeats = Number(repeatsArg);
const token = process.env.FACTORY_TOKEN;
if (!token || !workRoot) throw new Error("usage: FACTORY_TOKEN=... node delegate-matrix.ts <pilots> <repeats> <workRoot>");
const root: string = workRoot;
const factoryToken: string = token;

const TIER_MODELS = { low: "haiku", medium: "sonnet", high: "opus" };
const HOW: Record<string, string> = {
  claude: "(use the Agent tool with model set to pendingWork.model)",
  opencode: "(use your subagent tool with agent set to pendingWork.model)",
};

function pilotPrompt(pilot: string, key: string): string {
  return [
    'You are testing an MCP server named "factory". Use only the factory tools and your subagent tool.',
    `1. Call factory_start with goal "add a greeting function" and idempotencyKey "${key}".`,
    `2. The user already approved the proposal: call factory_confirm with that runId and overrides ${JSON.stringify({ backend: { kind: "delegate" }, tierModels: TIER_MODELS })}.`,
    '3. Then follow the "next" hint in each factory response until the run status is done, stopped, failed or cancelled.',
    '   If there is a pendingQuestion, the user\'s answer is "extend".',
    `   If the status is "waiting_for_client", run pendingWork.prompt in exactly one subagent that uses model pendingWork.model ${HOW[pilot]}, wait for it to finish, then call factory_submit for pendingWork.nodePath with the subagent's answer.`,
    ...(process.env.USAGE_HINT ? [`   ${process.env.USAGE_HINT}`] : []),
    "4. At the end call factory_report.",
    "Finally print exactly: RUN=<runId> STATUS=<status>",
  ].join("\n");
}

function cleanEnv(extra: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|ANTHROPIC)/.test(k)) env[k] = v;
  return { ...env, ...extra };
}

function spawnPilot(command: string, args: string[], cwd: string, stdinText: string): Promise<PilotSpawn> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, env: cleanEnv({ FACTORY_TOKEN: factoryToken, PWD: cwd }), shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 900000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, durationSec: Math.round((Date.now() - started) / 1000) });
    });
    child.stdin.end(stdinText ?? "");
  });
}

function prepareDirs(): PilotDirs {
  const claudeDir = path.join(root, "pilot-claude");
  const opencodeDir = path.join(root, "pilot-opencode");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(opencodeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "mcp.json"), JSON.stringify({ mcpServers: { factory: { type: "http", url: "http://127.0.0.1:7340/mcp", headers: { Authorization: "Bearer ${FACTORY_TOKEN}" } } } }));
  const agents = Object.fromEntries(Object.values(TIER_MODELS).map((m) => [m, { mode: "subagent", model: `anthropic/claude-${m}-5-5`, description: `Runs a delegated factory node on Claude ${m} 5.5` }]));
  fs.writeFileSync(
    path.join(opencodeDir, "opencode.json"),
    JSON.stringify({ agent: agents, mcp: { servers: { factory: { type: "remote", url: "http://127.0.0.1:7340/mcp", oauth: false, headers: { Authorization: "Bearer {env:FACTORY_TOKEN}" } } } } }, null, 2),
  );
  return { claudeDir, opencodeDir };
}

function parseEvents(stdout: string): PilotEvent[] {
  const events: PilotEvent[] = [];
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as PilotEvent | null;
      if (event) events.push(event);
    } catch {
      continue;
    }
  }
  return events;
}

async function runPilot(pilot: string, key: string, dirs: PilotDirs): Promise<PilotResult> {
  const prompt = pilotPrompt(pilot, key);
  if (pilot === "claude") {
    const res = await spawnPilot("claude", ["-p", "--mcp-config", "mcp.json", "--strict-mcp-config", "--allowedTools", "mcp__factory,Agent", "--model", "haiku", "--max-turns", "80", "--max-budget-usd", "1", "--output-format", "json"], dirs.claudeDir, prompt);
    try {
      const out = JSON.parse(res.stdout) as { is_error?: boolean; result?: string; total_cost_usd?: number; num_turns?: number };
      return { ok: !out.is_error, text: String(out.result), pilotCostUsd: out.total_cost_usd, pilotTurns: out.num_turns, durationSec: res.durationSec };
    } catch {
      return { ok: false, text: (res.stderr || res.stdout).slice(-300), durationSec: res.durationSec };
    }
  }
  const res = await spawnPilot("opencode", ["run", "--standalone", "--archived", "--format", "json", "-m", "anthropic/claude-haiku-5-5"], dirs.opencodeDir, prompt);
  fs.writeFileSync(path.join(root, `${key}.jsonl`), res.stdout + "\n--- stderr ---\n" + res.stderr);
  const events = parseEvents(res.stdout);
  const text = events.filter((e) => e.part?.type === "text").map((e) => e.part?.text).pop() ?? "";
  const steps = events.filter((e) => e.part?.type === "step-finish").length;
  const err = events.find((e) => e.type === "error");
  return { ok: !err && steps > 0, text: err ? JSON.stringify(err.error).slice(0, 300) : text, pilotCostUsd: null, pilotTurns: steps, durationSec: res.durationSec };
}

function readRuns(): Run[] {
  const json = execFileSync("docker", ["exec", container, "node", "-e", "const fs=require('fs');const d='/data/runs';console.log(JSON.stringify(fs.readdirSync(d).map(f=>JSON.parse(fs.readFileSync(d+'/'+f)))))"], { encoding: "utf8" });
  return JSON.parse(json) as Run[];
}

const dirs = prepareDirs();
const pilotResults: (PilotResult & { pilot: string; repeat: number; key: string })[] = [];
for (const pilot of pilots) {
  for (let i = 1; i <= repeats; i += 1) {
    const key = `delegate-${pilot}-${i}`;
    const r = await runPilot(pilot, key, dirs);
    pilotResults.push({ pilot, repeat: i, key, ...r });
    console.log(`${pilot} #${i}: ok=${r.ok} ${r.durationSec}s pilotTurns=${r.pilotTurns} pilotCost=${r.pilotCostUsd ?? "n/a"} :: ${(String(r.text).split("\n").pop() ?? "").slice(0, 120)}`);
  }
}

const runs = readRuns();
const rows: MatrixRow[] = [];
for (const p of pilotResults) {
  const run = runs.find((r) => r.idempotencyKey === p.key);
  if (!run) {
    rows.push({ ...p, runStatus: "no run", nodes: [] });
    continue;
  }
  const nodes: MatrixNode[] = [];
  for (const rec of run.ledger.filter((r) => r.kind === "llm")) {
    let enriched: (PricedUsage & { tokens: TokenCounts }) | null = null;
    if (rec.childSessionId) {
      const u = await opencodeSessionUsage(rec.childSessionId);
      if (u.ok && u.tokens) enriched = { ...priceUsage(rec.model, u.tokens, u.cacheWriteTtlKnown ?? false), tokens: u.tokens };
    }
    nodes.push({
      node: rec.nodePath,
      tier: rec.tier,
      model: rec.model,
      submitted: { totalTokens: rec.totalTokens, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, childSessionId: rec.childSessionId },
      costSourceAsSubmitted: rec.costSource,
      costUsdAsSubmitted: rec.costUsd,
      costSourceAfterEnrichment: enriched?.costSource ?? rec.costSource,
      costUsdAfterEnrichment: enriched?.costUsd ?? rec.costUsd,
    });
  }
  rows.push({ ...p, runId: run.runId, runStatus: run.status, steps: run.steps, nodes });
}
const outFile = path.join(root, "delegate-matrix.json");
fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
for (const r of rows) {
  console.log(`== ${r.pilot} #${r.repeat} run=${r.runStatus}`);
  for (const n of r.nodes) console.log(`   ${String(n.tier).padEnd(7)} ${String(n.model).padEnd(7)} submitted=${JSON.stringify(n.submitted)} -> ${n.costSourceAsSubmitted} / after enrichment ${n.costSourceAfterEnrichment} $${n.costUsdAfterEnrichment == null ? "?" : n.costUsdAfterEnrichment.toFixed(5)}`);
}
console.log(`results: ${outFile}`);
