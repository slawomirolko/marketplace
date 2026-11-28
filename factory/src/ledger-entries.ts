import { priceUsage } from "./prices.ts";
import type { CliName, CliResult, LedgerEntry, PendingWork, SubmitUsage, Tier, TokenCounts } from "./types.ts";

/** Prices per million tokens for the fake backend only: fixed test numbers that make fake runs cost something, not real model prices. */
const FAKE_PRICE_PER_MTOK: Record<Tier, { input: number; output: number }> = {
  low: { input: 0.8, output: 4 },
  medium: { input: 3, output: 15 },
  high: { input: 15, output: 75 },
};

/** How much of an agent's or a script's output an event or a ledger preview keeps. */
export const OUTPUT_PREVIEW_CHARS = 200;

/** A fake model turn: token counts that grow with the turn and the agent, priced with the fake prices. */
export function fakeModelTurn(tier: Tier, turn: number, agentIndex = 0) {
  const inputTokens = 3000 + turn * 1500 + agentIndex * 700;
  const outputTokens = 300 + turn * 50;
  const price = FAKE_PRICE_PER_MTOK[tier];
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return { inputTokens, outputTokens, costUsd };
}

/** The ledger entry of a delegate agent's reply, priced from the usage the client reported. */
export function delegateEntry(work: PendingWork, output: string, usage: SubmitUsage): LedgerEntry {
  const inputTokens = Number.isInteger(usage.inputTokens) ? usage.inputTokens : undefined;
  const outputTokens = Number.isInteger(usage.outputTokens) ? usage.outputTokens : undefined;
  const hasSplit = inputTokens !== undefined && outputTokens !== undefined;
  const tokens: TokenCounts = {
    input: hasSplit ? inputTokens : null,
    output: hasSplit ? outputTokens : null,
    cacheRead: usage.cacheReadTokens ?? 0,
    cacheWrite5m: usage.cacheWriteTokens ?? 0,
    cacheWrite1h: 0,
  };
  const priced = hasSplit ? priceUsage(usage.model ?? work.model, tokens, false) : { costUsd: null };
  return {
    nodePath: work.nodePath,
    agentId: work.agentId,
    kind: "llm",
    tier: work.tier,
    model: usage.model ?? work.model,
    backend: "delegate",
    turn: 1,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cacheReadTokens: tokens.cacheRead,
    cacheWrite5mTokens: tokens.cacheWrite5m,
    cacheWrite1hTokens: 0,
    totalTokens: usage.totalTokens ?? null,
    childSessionId: usage.childSessionId ?? null,
    costUsd: priced.costUsd,
    costSource: hasSplit ? "reported" : "unknown",
    outputPreview: String(output ?? "").slice(0, OUTPUT_PREVIEW_CHARS),
    agentName: work.agentName ?? null,
  };
}

export interface CliEntryContext {
  nodePath: string;
  agentId: string;
  agentName: string | null;
  tier: Tier;
  requestedModel: string;
  cli: CliName;
  keepOutput: boolean;
}

/** One ledger entry per model a CLI agent used, priced from the CLI's token counts. */
export function cliEntries(result: CliResult, context: CliEntryContext): LedgerEntry[] {
  return (result.usageByModel ?? []).map((usage) => {
    const priced = priceUsage(usage.model, usage.tokens, usage.cacheWriteTtlKnown);
    return {
      nodePath: context.nodePath,
      agentId: context.agentId,
      kind: "llm",
      tier: context.tier,
      model: usage.model,
      requestedModel: context.requestedModel,
      backend: `cli:${context.cli}`,
      turn: 1,
      harnessTurns: result.turns,
      inputTokens: usage.tokens.input,
      outputTokens: usage.tokens.output,
      cacheReadTokens: usage.tokens.cacheRead,
      cacheWrite5mTokens: usage.tokens.cacheWrite5m,
      cacheWrite1hTokens: usage.tokens.cacheWrite1h,
      costUsd: priced.costUsd,
      costSource: priced.costSource,
      harnessCostUsd: usage.harnessCostUsd,
      durationMs: result.durationMs,
      outputPreview: String(result.text ?? "").slice(0, OUTPUT_PREVIEW_CHARS),
      output: context.keepOutput ? (result.text ?? null) : null,
      agentName: context.agentName,
    };
  });
}
