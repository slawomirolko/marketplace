import type { Cost, Coverage } from "./types.ts";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
/** Costs are shown to the micro-dollar, the precision the backend rounds them to. */
const COST_DIGITS = 6;

/** A dollar amount to the micro-dollar; `unknownText` (default "unknown") when the amount is not known. */
export function formatCost(costUsd: number | null | undefined, unknownText = "unknown"): string {
  if (costUsd === null || costUsd === undefined) {
    return unknownText;
  }
  return `$${costUsd.toFixed(COST_DIGITS)}`;
}

/** A count with thousands separators, or a dash when there is none. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return value.toLocaleString("en-US");
}

export function formatTokens(tokens: number | null | undefined, cacheTokens?: number | null): string {
  const base = `${formatCount(tokens ?? 0)} tok`;
  return cacheTokens ? `${base} + ${formatCount(cacheTokens)} cache` : base;
}

/** A summed cost with its coverage: unknown when no LLM step has a known cost, a lower bound when only some have. */
export function formatAmount(costUsd: number | null | undefined, coverage?: Coverage | null): string {
  const unknown = coverage?.unknownSteps ?? 0;
  if (unknown > 0 && unknown === coverage?.llmSteps) {
    return "unknown";
  }
  const amount = formatCost(costUsd ?? 0);
  return unknown > 0 ? `≥ ${amount} (partial, ${unknown} of ${coverage?.llmSteps} LLM steps unknown)` : amount;
}

export function isUnknownCost(coverage?: Coverage | null): boolean {
  return (coverage?.unknownSteps ?? 0) > 0;
}

export function formatUsd(cost: Cost | null | undefined): string {
  if (!cost) {
    return "not run";
  }
  if (cost.costSource === "unknown") {
    return "unknown";
  }
  return formatAmount(cost.costUsd, cost);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** A duration in the largest fitting unit: ms below a second, then s, m and s, h and m; a dash when unknown. */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) {
    return "—";
  }
  const whole = Math.round(ms);
  if (whole < MS_PER_SECOND) {
    return `${whole}ms`;
  }
  const seconds = Math.round(whole / MS_PER_SECOND);
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds}s`;
  }
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ${twoDigits(seconds % SECONDS_PER_MINUTE)}s`;
  }
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  return `${Math.floor(minutes / MINUTES_PER_HOUR)}h ${twoDigits(minutes % MINUTES_PER_HOUR)}m`;
}
