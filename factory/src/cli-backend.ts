import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AgentTool, CliExecutor, CliName, CliRequest, CliResult, ExecResult, TokenCounts } from "./types.ts";
import { claudeAgentsFile, claudeTools, opencodeConfigDir } from "./cli-agents.ts";
import { homeEnv } from "./home-env.ts";
import { AGENT_NAME } from "./marketplace-agents.ts";
import { MODEL_ALIASES } from "./models.ts";
import { spawnPlan } from "./win-spawn.ts";

const TIMEOUT_MS = 900000;
/** A prompt without an agent gets no tool at all. */
const CLAUDE_DISALLOWED = claudeTools([]).disallowed.join(",");
/** The turn limit of a Claude Code run with an agent, and of a plain prompt without one. */
const AGENT_MAX_TURNS = "40";
const PROMPT_MAX_TURNS = "2";
/** How much of a failing CLI's message or output an error keeps. */
const ERROR_TEXT_CHARS = 300;

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

let workDir: string | undefined;

/** The neutral folder a CLI runs in when the node has no workspace. It is made on first use and made again when the temp cleaner removed it, since its age never changes. */
function cliWorkDir(): string {
  if (workDir === undefined || !fs.existsSync(workDir)) {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-cli-"));
    fs.writeFileSync(path.join(workDir, "opencode.json"), "{}\n");
  }
  return workDir;
}

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
  if (process.platform !== "win32" || pid === undefined) {
    return fallback();
  }
  spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).on("error", fallback);
}

function spawnCli(command: string, args: string[], stdinText?: string, { cwd = cliWorkDir(), env = {} }: { cwd?: string; env?: Record<string, string> } = {}): Promise<SpawnResult> {
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
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
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

/** The JSON events of an OpenCode run, one per line, and how many lines were not JSON and so were dropped. */
function parseEvents(stdout: string): { events: OpencodeEvent[]; malformedLines: number } {
  const events: OpencodeEvent[] = [];
  let malformedLines = 0;
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as OpencodeEvent | null;
      if (event) {
        events.push(event);
      }
    } catch {
      malformedLines += 1;
    }
  }
  return { events, malformedLines };
}

type AgentRunOptions = Omit<CliRequest, "model" | "prompt">;

function removeTempDir(dir: string): void {
  if (path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** Why a request cannot start a CLI, or null: an agent name outside the agent alphabet, or an invalid model or extra directory. */
function requestError(agent: string | undefined, model: string, dirs: string[]): string | null {
  if (agent && !AGENT_NAME.test(agent)) {
    return `invalid agent name ${agent}`;
  }
  return invalidRequest(model, dirs);
}

function claudeAgentArgs(agent: string, tools: AgentTool[], dirs: string[], definition: CliRequest["definition"]): string[] {
  const { allowed, disallowed } = claudeTools(tools);
  const permission = tools.includes("edit") ? ["--permission-mode", "acceptEdits"] : [];
  return ["--agents", claudeAgentsFile(definition ?? agent, tools), "--agent", agent, "--max-turns", AGENT_MAX_TURNS, "--allowedTools", allowed.join(","), "--disallowedTools", disallowed.join(","), ...permission, ...dirs.flatMap((dir) => ["--add-dir", dir])];
}

async function runClaude(model: string, prompt: string, { agent: named, definition, cwd, tools = ["read"], dirs = [], env = {} }: AgentRunOptions = {}): Promise<CliResult> {
  const agent = definition?.name ?? named;
  const invalid = requestError(agent, model, dirs);
  if (invalid) {
    return { ok: false, error: invalid };
  }
  const args = agent
    ? ["-p", "--model", model, "--output-format", "json", ...CLAUDE_ISOLATION, ...claudeAgentArgs(agent, tools, dirs, definition)]
    : ["-p", "--model", model, "--output-format", "json", ...CLAUDE_ISOLATION, "--max-turns", PROMPT_MAX_TURNS, "--disallowedTools", CLAUDE_DISALLOWED];
  const agentFile = args[args.indexOf("--agents") + 1];
  const res = await spawnCli("claude", args, prompt, { cwd: cwd ?? cliWorkDir(), env }).finally(() => {
    if (agent && agentFile) {
      removeTempDir(path.dirname(agentFile));
    }
  });
  let out: ClaudeOutput;
  try {
    out = JSON.parse(res.stdout) as ClaudeOutput;
  } catch {
    return { ok: false, error: `claude exit ${res.code}${res.timedOut ? " (timed out)" : ""}: ${(res.stderr || res.stdout).slice(-ERROR_TEXT_CHARS)}`, durationMs: res.durationMs, timedOut: res.timedOut };
  }
  const usageByModel = Object.entries(out.modelUsage ?? {}).map(([id, usage]) => ({
    model: id,
    tokens: {
      input: usage.inputTokens ?? 0,
      output: usage.outputTokens ?? 0,
      cacheRead: usage.cacheReadInputTokens ?? 0,
      cacheWrite5m: usage.cacheCreationEphemeral5mInputTokens ?? 0,
      cacheWrite1h: usage.cacheCreationEphemeral1hInputTokens ?? 0,
    },
    cacheWriteTtlKnown: true,
    harnessCostUsd: usage.costUSD ?? null,
  }));
  return { ok: !out.is_error, error: out.is_error ? String(out.result).slice(0, ERROR_TEXT_CHARS) : undefined, text: out.result, turns: out.num_turns, harnessCostUsd: out.total_cost_usd ?? null, usageByModel, durationMs: res.durationMs };
}

/** The OpenCode model id: a short alias or a full Claude model id gets the anthropic/ provider prefix; any other id passes as it is. */
function opencodeModelId(model: string): string {
  const full = MODEL_ALIASES[model] ?? model;
  return full.startsWith("claude-") ? `anthropic/${full}` : full;
}

async function runOpencode(model: string, prompt: string, { agent: named, definition, cwd, configDir, tools = ["read"], dirs = [], env = {} }: AgentRunOptions = {}): Promise<CliResult> {
  const agent = definition?.name ?? named;
  const id = opencodeModelId(model);
  const invalid = requestError(agent, model, dirs);
  if (invalid) {
    return { ok: false, error: invalid };
  }
  const args = ["run", "--standalone", "--archived", "--format", "json", "-m", id, ...(agent ? ["--agent", agent] : [])];
  const agentDir = configDir ?? (agent ? opencodeConfigDir(definition ?? agent, tools, dirs) : undefined);
  const res = await spawnCli("opencode", args, prompt, { cwd: cwd ?? cliWorkDir(), env: { ...env, ...(agentDir ? { OPENCODE_CONFIG_DIR: agentDir } : {}) } }).finally(() => {
    if (agentDir && !configDir) {
      removeTempDir(agentDir);
    }
  });
  const { events, malformedLines } = parseEvents(res.stdout);
  const error = events.find((event) => event.type === "error");
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, reasoning: 0 };
  let steps = 0;
  let harnessCostUsd = 0;
  let text = "";
  for (const event of events) {
    const part = event.part ?? {};
    if (part.type === "step-finish") {
      steps += 1;
      const stepTokens = part.tokens ?? {};
      tokens.input += stepTokens.input ?? 0;
      tokens.output += stepTokens.output ?? 0;
      tokens.reasoning += stepTokens.reasoning ?? 0;
      tokens.cacheRead += stepTokens.cache?.read ?? 0;
      tokens.cacheWrite5m += stepTokens.cache?.write ?? 0;
      harnessCostUsd += part.cost ?? 0;
    }
    if (part.type === "text") {
      text = part.text ?? text;
    }
  }
  const dropped = malformedLines > 0 ? { malformedLines } : {};
  if (error || steps === 0) {
    const reason = error ? JSON.stringify(error.error ?? error).slice(0, ERROR_TEXT_CHARS) : `opencode exit ${res.code}${res.timedOut ? " (timed out)" : ""}: ${res.stderr.slice(-ERROR_TEXT_CHARS)}`;
    return { ok: false, error: malformedLines > 0 ? `${reason} (${malformedLines} malformed output lines dropped)` : reason, durationMs: res.durationMs, timedOut: res.timedOut, ...dropped };
  }
  const sessionId = events.find((event) => event.sessionID)?.sessionID ?? null;
  return { ok: true, text, turns: steps, sessionId, harnessCostUsd, usageByModel: [{ model: id, tokens, cacheWriteTtlKnown: false, harnessCostUsd }], durationMs: res.durationMs, ...dropped };
}

export async function opencodeSessionUsage(sessionId: string): Promise<SessionUsage> {
  if (!/^ses_[A-Za-z0-9]+$/.test(sessionId)) {
    return { ok: false, error: "invalid session id" };
  }
  const res = await spawnCli("opencode", ["session", "export", sessionId]);
  try {
    const session = JSON.parse(res.stdout) as OpencodeSession;
    const sessionTokens = session.info?.tokens ?? {};
    return {
      ok: true,
      parentId: session.info?.parentID ?? null,
      tokens: { input: sessionTokens.input ?? 0, output: sessionTokens.output ?? 0, reasoning: sessionTokens.reasoning ?? 0, cacheRead: sessionTokens.cache?.read ?? 0, cacheWrite5m: sessionTokens.cache?.write ?? 0, cacheWrite1h: 0 },
      cacheWriteTtlKnown: false,
      harnessCostUsd: session.info?.cost ?? null,
    };
  } catch {
    return { ok: false, error: `export failed: ${res.stderr.slice(-ERROR_TEXT_CHARS)}` };
  }
}

export function cliExecutor(cli: CliName): CliExecutor {
  if (cli === "claude") {
    return ({ model, prompt, ...options }) => runClaude(model, prompt, options);
  }
  if (cli === "opencode") {
    return ({ model, prompt, ...options }) => runOpencode(model, prompt, options);
  }
  throw new Error(`unsupported cli ${cli}`);
}

export function hostExec(command: string, args: string[], options: { cwd?: string } = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: cleanEnv(), shell: false, ...(options.cwd ? { cwd: options.cwd } : {}) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ code: -1, stdout, stderr: String(error) }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
