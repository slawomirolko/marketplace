import { formatAmount, formatDuration, formatTokens, formatUsd } from "../src/format.ts";
import type { Cost, Coverage } from "../src/types.ts";

function cost(costUsd: number, costSource: string): Cost {
  return { costUsd, costSource, tokens: 0, cacheTokens: 0, steps: 1, llmSteps: 1, unknownSteps: 0 };
}

test.each([
  { tokens: 1234, cacheTokens: undefined, text: "1,234 tok" },
  { tokens: 1234, cacheTokens: 5678, text: "1,234 tok + 5,678 cache" },
  { tokens: undefined, cacheTokens: 0, text: "0 tok" },
])("token counts show the cache part only when there is cache: $text", ({ tokens, cacheTokens, text }) => {
  expect(formatTokens(tokens, cacheTokens)).toBe(text);
});

test.each([
  { name: "unknown cost is shown as unknown", value: cost(0, "unknown"), text: "unknown" },
  { name: "missing cost is shown as not run", value: null, text: "not run" },
  { name: "a measured cost is shown to the micro-dollar", value: cost(0.1234567, "measured"), text: "$0.123457" },
])("$name", ({ value, text }) => {
  expect(formatUsd(value)).toBe(text);
});

test.each<{ name: string; costUsd: number; coverage: Coverage; text: string }>([
  { name: "a total with some unknown steps is a lower bound", costUsd: 0.25, coverage: { llmSteps: 3, unknownSteps: 2 }, text: "≥ $0.250000 (partial, 2 of 3 LLM steps unknown)" },
  { name: "a total with only unknown steps is unknown, not $0", costUsd: 0, coverage: { llmSteps: 1, unknownSteps: 1 }, text: "unknown" },
  { name: "one unknown step of two is a lower bound", costUsd: 0.25, coverage: { llmSteps: 2, unknownSteps: 1 }, text: "≥ $0.250000 (partial, 1 of 2 LLM steps unknown)" },
  { name: "a total with every step known is exact", costUsd: 0.25, coverage: { llmSteps: 1, unknownSteps: 0 }, text: "$0.250000" },
])("$name", ({ costUsd, coverage, text }) => {
  expect(formatAmount(costUsd, coverage)).toBe(text);
});

test.each<[number | null, string]>([
  [null, "—"],
  [0, "0ms"],
  [840, "840ms"],
  [999, "999ms"],
  [1000, "1s"],
  [59_400, "59s"],
  [59_600, "1m 00s"],
  [192_000, "3m 12s"],
  [3_599_000, "59m 59s"],
  [3_900_000, "1h 05m"],
  [36_000_000, "10h 00m"],
])("durations read as 840ms, 3m 12s or 1h 05m: %s ms is %s", (ms, text) => {
  expect(formatDuration(ms)).toBe(text);
});
