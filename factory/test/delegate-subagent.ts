import { cliExecutor } from "../src/cli-backend.ts";
import type { AgentTool, CliName, CliResult } from "../src/types.ts";

type Payload = Record<string, any>;

export interface SubagentResult {
  output: string;
  usage: { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

const HARNESSES: CliName[] = ["claude", "opencode"];
const ATTEMPTS = 2;

/** The CLI that plays the client harness in the delegate integration tests: FACTORY_TEST_HARNESS=claude (default) or opencode. */
export const TEST_HARNESS = harnessFromEnv(process.env.FACTORY_TEST_HARNESS);

function harnessFromEnv(value: string | undefined): CliName {
  const harness = (value ?? "claude") as CliName;
  if (!HARNESSES.includes(harness)) throw new Error(`FACTORY_TEST_HARNESS must be one of ${HARNESSES.join(", ")}, got ${value}`);
  return harness;
}

function usageOf(result: CliResult): SubagentResult["usage"] {
  const [main] = [...(result.usageByModel ?? [])].sort((a, b) => (b.tokens.output ?? 0) - (a.tokens.output ?? 0));
  if (!main) throw new Error("the subagent reported no token usage");
  const t = main.tokens;
  return { model: main.model, inputTokens: t.input ?? 0, outputTokens: t.output ?? 0, cacheReadTokens: t.cacheRead ?? 0, cacheWriteTokens: (t.cacheWrite5m ?? 0) + (t.cacheWrite1h ?? 0) };
}

/** Runs one pendingWorkItems entry as an isolated subagent of TEST_HARNESS, with the engine's per-call timeout and one retry. */
export async function runSubagent(work: Payload, { cwd, env, tools }: { cwd: string; env?: Record<string, string>; tools?: AgentTool[] }): Promise<SubagentResult> {
  const run = cliExecutor(TEST_HARNESS);
  const request = {
    model: work.model as string,
    prompt: work.prompt as string,
    definition: { name: work.agentName as string, description: work.agentDescription as string, prompt: work.agentInstructions as string },
    cwd,
    env,
    tools: tools ?? (work.tools as AgentTool[]),
    dirs: work.dirs as string[],
  };
  const errors: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const result = await run(request);
    if (result.ok) return { output: result.text ?? "", usage: usageOf(result) };
    errors.push(`attempt ${attempt}: ${result.error}`);
  }
  throw new Error(`${TEST_HARNESS} subagent ${work.agentName} at ${work.nodePath} failed: ${errors.join(" | ")}`);
}
