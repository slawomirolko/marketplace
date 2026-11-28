import type { Cost, Coverage } from "./types.ts";

export function formatTokens(tokens: number | null | undefined, cacheTokens?: number | null): string {
  const base = `${(tokens ?? 0).toLocaleString("en-US")} tok`;
  return cacheTokens ? `${base} + ${cacheTokens.toLocaleString("en-US")} cache` : base;
}

export function formatAmount(costUsd: number | null | undefined, coverage?: Coverage | null): string {
  const unknown = coverage?.unknownSteps ?? 0;
  if (unknown > 0 && unknown === coverage?.llmSteps) return "unknown";
  const amount = `$${(costUsd ?? 0).toFixed(6)}`;
  return unknown > 0 ? `≥ ${amount} (partial, ${unknown} of ${coverage?.llmSteps} LLM steps unknown)` : amount;
}

export function isUnknownCost(coverage?: Coverage | null): boolean {
  return (coverage?.unknownSteps ?? 0) > 0;
}

export function formatUsd(cost: Cost | null | undefined): string {
  if (!cost) return "not run";
  if (cost.costSource === "unknown") return "unknown";
  return formatAmount(cost.costUsd, cost);
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const whole = Math.round(ms);
  if (whole < 1000) return `${whole}ms`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const s = Math.round(whole / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}
