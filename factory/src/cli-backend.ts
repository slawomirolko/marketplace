import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AgentTool, CliExecutor, CliName, CliRequest, CliResult, ExecResult, TokenCounts } from "./types.ts";
import { claudeAgentsFile, claudeTools, opencodeConfigDir } from "./marketplace-agents.ts";
import { homeEnv } from "./home-env.ts";
import { spawnPlan } from "./win-spawn.ts";

const TIMEOUT_MS = 900000;
const OPENCODE_IDS: Record<string, string> = { haiku: "anthropic/claude-haiku-5-5", sonnet: "anthropic/claude-sonnet-5-5", opus: "anthropic/claude-opus-5-5" };
const CLAUDE_DISALLOWED = "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,Task,NotebookEdit";

const MODEL_NAME = /^[\w./:-]+$/;

const CLAUDE_ISOLATION = ["--setting-sources", "project", "--disable-slash-commands", "--strict-mcp-config"];

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

interface ClaudeModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationEphemeral5mInputTokens?: number;
  cacheCreationEphemeral1hInputTokens?: number;
  costUSD?: number;
}

interface ClaudeOutput {
  modelUsage?: Record<string, ClaudeModelUsage>;
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
}

interface OpencodeTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

interface OpencodeEvent {
  type?: string;
  error?: unknown;
  sessionID?: string;
  part?: { type?: string; text?: string; cost?: number; tokens?: OpencodeTokens };
}

interface OpencodeSession {
  info?: { parentID?: string; tokens?: OpencodeTokens; cost?: number };
}

export interface SessionUsage {
  ok: boolean;
  error?: string;
  parentId?: string | null;
  tokens?: TokenCounts;
  cacheWriteTtlKnown?: boolean;
  harnessCostUsd?: number | null;
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cli-"));
fs.writeFileSync(path.join(workDir, "opencode.json"), "{}\n");

/** The environment of every child process: no harness variables, no factory token and none of the settings loaded from the factory home's .env. */
function cleanEnv(): Record<string, string | undefined> {
  const withheld = new Set(["FACTORY_TOKEN", ...homeEnv.loaded]);
  const env: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!/^(CLAUDE|ANTHROPIC)/.test(name) && !withheld.has(name)) {
      env[name] = value;
    }
  }
  return env;
}

/** Why a request cannot start a CLI: a model name outside the model alphabet, or an extra directory that is not an existing absolute folder. */
function invalidRequest(model: string, dirs: string[]): string | null {
  if (!MODEL_NAME.test(model)) {
    return `invalid model ${JSON.stringify(model)}`;
  }
  const badDir = dirs.find((dir) => !path.isAbsolute(dir) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory());
  return badDir === undefined ? null : `extra directory ${JSON.stringify(badDir)} is not an absolute existing folder`;
}

/** On Windows an npm .cmd shim runs under cmd.exe, so killing cmd.exe leaves the CLI running; taskkill /T ends the whole tree. */
function killTree(pid: number | undefined, fallback: () => void): void {
  if (process.platform !== "win32" || pid === undefined) return fallback();
  spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).on("error", fallback);
}

function spawnCli(command: string, args: string[], stdinText?: string, { cwd = workDir, env = {} }: { cwd?: string; env?: Record<string, string> } = {}): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const childEnv = { ...cleanEnv(), PWD: cwd, ...env };
    const plan = spawnPlan(command, args, childEnv);
    const child = spawn(plan.file, plan.args, { cwd, env: childEnv, shell: false, windowsVerbatimArguments: plan.windowsVerbatimArguments });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid, () => child.kill());
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => {
      stderr += String(error);
    });
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, durationMs: Date.now() - started, timedOut });
    });
    child.stdin.end(stdinText ?? "");
  });
}

function parseEvents(stdout: string): OpencodeEvent[] {
  const events: OpencodeEvent[] = [];
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as OpencodeEvent | null;
      if (event) events.push(event);
    } catch {
      continue;
    }
  }
  return events;
}

type AgentRunOptions = Omit<CliRequest, "model" | "prompt">;

function removeTempDir(dir: string): void {
  if (path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir())) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

function claudeAgentArgs(agent: string, tools: AgentTool[], dirs: string[], definition: CliRequest["definition"]): string[] {
  const { allowed, disallowed } = claudeTools(tools);
  const permission = tools.includes("edit") ? ["--permission-mode", "acceptEdits"] : [];
  return ["--agents", claudeAgentsFile(definition ?? agent, tools), "--agent", agent, "--max-turns", "40", "--allowedTools", allowed.join(","), "--disallowedTools", disallowed.join(","), ...permission, ...dirs.flatMap((d) => ["--add-dir", d])];
}

async function runClaude(model: string, prompt: string, { agent: named, definition, cwd, tools = ["read"], dirs = [], env = {} }: AgentRunOptions = {}): Promise<CliResult> {
  const agent = definition?.name ?? named;
  if (agent && !/^[a-z0-9-]+$/.test(agent)) return { ok: false, error: `invalid agent name ${agent}` };
  const invalid = invalidRequest(model, dirs);
  if (invalid) {
    return { ok: false, error: invalid };
  }
  const args = agent
    ? ["-p", "--model", model, "--output-format", "json", ...CLAUDE_ISOLATION, ...claudeAgentArgs(agent, tools, dirs, definition)]
    : ["-p", "--model", model, "--output-format", "json", ...CLAUDE_ISOLATION, "--max-turns", "2", "--disallowedTools", CLAUDE_DISALLOWED];
  const agentFile = args[args.indexOf("--agents") + 1];
  const res = await spawnCli("claude", args, prompt, { cwd: cwd ?? workDir, env }).finally(() => {
    if (agent && agentFile) removeTempDir(path.dirname(agentFile));
  });
  let out: ClaudeOutput;
  try {
    out = JSON.parse(res.stdout) as ClaudeOutput;
  } catch {
    return { ok: false, error: `claude exit ${res.code}${res.timedOut ? " (timed out)" : ""}: ${(res.stderr || res.stdout).slice(-300)}`, durationMs: res.durationMs, timedOut: res.timedOut };
  }
  const usageByModel = Object.entries(out.modelUsage ?? {}).map(([id, u]) => ({
    model: id,
    tokens: {
      input: u.inputTokens ?? 0,
      output: u.outputTokens ?? 0,
      cacheRead: u.cacheReadInputTokens ?? 0,
      cacheWrite5m: u.cacheCreationEphemeral5mInputTokens ?? 0,
      cacheWrite1h: u.cacheCreationEphemeral1hInputTokens ?? 0,
    },
    cacheWriteTtlKnown: true,
    harnessCostUsd: u.costUSD ?? null,
  }));
  return { ok: !out.is_error, error: out.is_error ? String(out.result).slice(0, 300) : undefined, text: out.result, turns: out.num_turns, harnessCostUsd: out.total_cost_usd ?? null, usageByModel, durationMs: res.durationMs };
}

async function runOpencode(model: string, prompt: string, { agent: named, definition, cwd, configDir, tools = ["read"], dirs = [], env = {} }: AgentRunOptions = {}): Promise<CliResult> {
  const agent = definition?.name ?? named;
  const id = OPENCODE_IDS[model] ?? (model.startsWith("claude-") ? `anthropic/${model}` : model);
  if (agent && !/^[a-z0-9-]+$/.test(agent)) return { ok: false, error: `invalid agent name ${agent}` };
  const invalid = invalidRequest(model, dirs);
  if (invalid) {
    return { ok: false, error: invalid };
  }
  const args = ["run", "--standalone", "--archived", "--format", "json", "-m", id, ...(agent ? ["--agent", agent] : [])];
  const agentDir = configDir ?? (agent ? opencodeConfigDir(definition ?? agent, tools, dirs) : undefined);
  const res = await spawnCli("opencode", args, prompt, { cwd: cwd ?? workDir, env: { ...env, ...(agentDir ? { OPENCODE_CONFIG_DIR: agentDir } : {}) } }).finally(() => {
    if (agentDir && !configDir) removeTempDir(agentDir);
  });
  const events = parseEvents(res.stdout);
  const error = events.find((e) => e.type === "error");
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, reasoning: 0 };
  let steps = 0;
  let harnessCostUsd = 0;
  let text = "";
  for (const e of events) {
    const p = e.part ?? {};
    if (p.type === "step-finish") {
      steps += 1;
      const t = p.tokens ?? {};
      tokens.input += t.input ?? 0;
      tokens.output += t.output ?? 0;
      tokens.reasoning += t.reasoning ?? 0;
      tokens.cacheRead += t.cache?.read ?? 0;
      tokens.cacheWrite5m += t.cache?.write ?? 0;
      harnessCostUsd += p.cost ?? 0;
    }
    if (p.type === "text") text = p.text ?? text;
  }
  if (error || steps === 0) return { ok: false, error: error ? JSON.stringify(error.error).slice(0, 300) : `opencode exit ${res.code}${res.timedOut ? " (timed out)" : ""}: ${res.stderr.slice(-300)}`, durationMs: res.durationMs, timedOut: res.timedOut };
  const sessionId = events.find((e) => e.sessionID)?.sessionID ?? null;
  return { ok: true, text, turns: steps, sessionId, harnessCostUsd, usageByModel: [{ model: id, tokens, cacheWriteTtlKnown: false, harnessCostUsd }], durationMs: res.durationMs };
}

export async function opencodeSessionUsage(sessionId: string): Promise<SessionUsage> {
  if (!/^ses_[A-Za-z0-9]+$/.test(sessionId)) return { ok: false, error: "invalid session id" };
  const res = await spawnCli("opencode", ["session", "export", sessionId]);
  try {
    const s = JSON.parse(res.stdout) as OpencodeSession;
    const t = s.info?.tokens ?? {};
    return {
      ok: true,
      parentId: s.info?.parentID ?? null,
      tokens: { input: t.input ?? 0, output: t.output ?? 0, reasoning: t.reasoning ?? 0, cacheRead: t.cache?.read ?? 0, cacheWrite5m: t.cache?.write ?? 0, cacheWrite1h: 0 },
      cacheWriteTtlKnown: false,
      harnessCostUsd: s.info?.cost ?? null,
    };
  } catch {
    return { ok: false, error: `export failed: ${res.stderr.slice(-300)}` };
  }
}

export function cliExecutor(cli: CliName): CliExecutor {
  if (cli === "claude") return ({ model, prompt, ...options }) => runClaude(model, prompt, options);
  if (cli === "opencode") return ({ model, prompt, ...options }) => runOpencode(model, prompt, options);
  throw new Error(`unsupported cli ${cli}`);
}

export function hostExec(command: string, args: string[], options: { cwd?: string } = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: cleanEnv(), shell: false, ...(options.cwd ? { cwd: options.cwd } : {}) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => resolve({ code: -1, stdout, stderr: String(error) }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
