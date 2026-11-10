import type { CostSource, TokenCounts } from "./types.ts";

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

interface ModelPrice extends Price {
  longContext?: Price & { overTokens: number };
}

const PER_MTOK: Record<string, ModelPrice> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, longContext: { overTokens: 100000, input: 0.5, output: 2.5, cacheRead: 0.05 } },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "opencode/deepseek-v4.1-flash-free": { input: 0, output: 0, cacheRead: 0 },
};

const ALIASES: Record<string, string> = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;

export const PRICE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing (read 2026-11-10); opencode/deepseek-v4.1-flash-free is OpenCode's free model (cost 0)";

export interface PricedUsage {
  costUsd: number | null;
  costSource: CostSource;
}

export function canonicalModel(model: string | null | undefined): string | null {
  if (!model) return null;
  const bare = String(model).replace(/^anthropic\//, "");
  return ALIASES[bare] ?? bare;
}

export function priceUsage(model: string | null | undefined, tokens: TokenCounts, cacheWriteTtlKnown: boolean): PricedUsage {
  const canonical = canonicalModel(model);
  const base = canonical === null ? undefined : PER_MTOK[canonical];
  if (!base) return { costUsd: null, costSource: "unknown" };
  if (tokens.input == null || tokens.output == null) return { costUsd: null, costSource: "unknown" };
  const promptTokens = tokens.input + (tokens.cacheRead ?? 0) + (tokens.cacheWrite5m ?? 0) + (tokens.cacheWrite1h ?? 0);
  const price = base.longContext && promptTokens > base.longContext.overTokens ? base.longContext : base;
  const cost =
    tokens.input * price.input +
    tokens.output * price.output +
    (tokens.cacheRead ?? 0) * price.cacheRead +
    (tokens.cacheWrite5m ?? 0) * price.input * CACHE_WRITE_5M +
    (tokens.cacheWrite1h ?? 0) * price.input * CACHE_WRITE_1H;
  const hasUntimedWrites = !cacheWriteTtlKnown && (tokens.cacheWrite5m ?? 0) > 0;
  return { costUsd: cost / 1_000_000, costSource: hasUntimedWrites ? "estimated" : "measured" };
}
