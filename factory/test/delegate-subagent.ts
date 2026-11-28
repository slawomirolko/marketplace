import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliExecutor } from "../src/cli-backend.ts";
import type { AgentTool, CliName, CliResult } from "../src/types.ts";
import { tempDir } from "./helpers/temp.ts";

type Payload = Record<string, any>;

export interface SubagentResult {
  output: string;
  usage: { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

/**
 * What an agent may reach beyond its folders. "none" (the default) points gh at an unresolvable host; "github-read"
 * lets gh read GitHub with the token in FACTORY_TEST_GH_READ_TOKEN, which should be a read-only token.
 */
export type SubagentNetwork = "none" | "github-read";

const HARNESSES: CliName[] = ["claude", "opencode"];
const ATTEMPTS = 2;
const REAL_CLAUDE_DIR = path.join(os.homedir(), ".claude");
/** Variables that would give an agent the developer's GitHub identity. */
const GITHUB_TOKENS = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"];
/** The variable that holds the read-only token for agents that opt in to "github-read". */
export const GH_READ_TOKEN_VARIABLE = "FACTORY_TEST_GH_READ_TOKEN";

/** The CLI that plays the client harness in the delegate integration tests: FACTORY_TEST_HARNESS=claude (default) or opencode. */
export const TEST_HARNESS = harnessFromEnv(process.env.FACTORY_TEST_HARNESS);

function harnessFromEnv(value: string | undefined): CliName {
  const harness = (value ?? "claude") as CliName;
  if (!HARNESSES.includes(harness)) throw new Error(`FACTORY_TEST_HARNESS must be one of ${HARNESSES.join(", ")}, got ${value}`);
  return harness;
}

/** A config folder with only the login of the real one, so the agent CLI can sign in but loads no user skills, agents or settings. */
function claudeConfigDir(root: string, loginFrom: string): string {
  const dir = path.join(root, "claude-config");
  fs.mkdirSync(dir, { recursive: true });
  const credentials = path.join(loginFrom, ".credentials.json");
  if (fs.existsSync(credentials)) {
    fs.copyFileSync(credentials, path.join(dir, ".credentials.json"));
  }
  return dir;
}

/**
 * The environment every test subagent runs with unless the caller passes its own: no GitHub token, an empty gh
 * config (no stored login), no git credential prompts, and OLKO_SYNC_HOME and CLAUDE_CONFIG_DIR under `root`;
 * the config folder gets only the login file from `loginFrom` (the real ~/.claude by default).
 * With network "none" gh points at github.invalid; with "github-read" gh gets the read-only token and nothing else.
 */
export function sandboxEnv(root: string, { network = "none", loginFrom = REAL_CLAUDE_DIR }: { network?: SubagentNetwork; loginFrom?: string } = {}): Record<string, string> {
  const base = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !GITHUB_TOKENS.includes(entry[0])));
  const ghConfig = path.join(root, "gh-config");
  fs.mkdirSync(ghConfig, { recursive: true });
  const env: Record<string, string> = {
    ...base,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GH_CONFIG_DIR: ghConfig,
    GH_PROMPT_DISABLED: "1",
    OLKO_SYNC_HOME: path.join(root, "olko-sync"),
    CLAUDE_CONFIG_DIR: claudeConfigDir(root, loginFrom),
  };
  if (network === "github-read") {
    const token = process.env[GH_READ_TOKEN_VARIABLE];
    if (!token) {
      throw new Error(`network "github-read" needs a read-only GitHub token in ${GH_READ_TOKEN_VARIABLE}; agents never get the developer's gh login`);
    }
    delete env.GH_HOST;
    env.GH_TOKEN = token;
  } else {
    env.GH_HOST = "github.invalid";
  }
  return env;
}

/** One sandbox per network setting for the whole test file. */
const sandboxes = new Map<SubagentNetwork, Record<string, string>>();

function sandboxFor(network: SubagentNetwork): Record<string, string> {
  let env = sandboxes.get(network);
  if (!env) {
    env = sandboxEnv(tempDir("factory-agent-sandbox-", { real: true }), { network });
    sandboxes.set(network, env);
  }
  return env;
}

function usageOf(result: CliResult): SubagentResult["usage"] {
  const [main] = [...(result.usageByModel ?? [])].sort((a, b) => (b.tokens.output ?? 0) - (a.tokens.output ?? 0));
  if (!main) throw new Error("the subagent reported no token usage");
  const t = main.tokens;
  return { model: main.model, inputTokens: t.input ?? 0, outputTokens: t.output ?? 0, cacheReadTokens: t.cacheRead ?? 0, cacheWriteTokens: (t.cacheWrite5m ?? 0) + (t.cacheWrite1h ?? 0) };
}

/**
 * Runs one pendingWorkItems entry as an isolated subagent of TEST_HARNESS, with one retry. The request passes no timeout, so
 * each attempt ends at the CLI backend's own process limit (TIMEOUT_MS in src/cli-backend.ts) or when `signal` aborts.
 * The agent runs in sandboxEnv() unless `env` is given; `network: "github-read"` is the explicit opt-in for GitHub reads.
 */
export async function runSubagent(work: Payload, { cwd, env, tools, network = "none", signal }: { cwd: string; env?: Record<string, string>; tools?: AgentTool[]; network?: SubagentNetwork; signal?: AbortSignal }): Promise<SubagentResult> {
  const run = cliExecutor(TEST_HARNESS);
  const agentEnv = env ?? sandboxFor(network);
  const request = {
    model: work.model as string,
    prompt: work.prompt as string,
    definition: { name: work.agentName as string, description: work.agentDescription as string, prompt: work.agentInstructions as string },
    cwd,
    env: agentEnv,
    tools: tools ?? (work.tools as AgentTool[]),
    dirs: work.dirs as string[],
    signal,
  };
  const errors: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const result = await run(request);
    if (result.ok) return { output: result.text ?? "", usage: usageOf(result) };
    errors.push(`attempt ${attempt}: ${result.error}`);
    if (signal?.aborted) {
      break;
    }
  }
  throw new Error(`${TEST_HARNESS} subagent ${work.agentName} at ${work.nodePath} failed: ${errors.join(" | ")}`);
}
