---
name: olko-factory-run-supervision
version: 0.1.0
description: "Rules to read the summary of one finished Software Factory run and find its bottleneck and optimizations: the summary fields, how to rank cost and time, and which changes to propose (cheaper tier, fewer rounds, a script instead of an LLM step, fewer questions). Use when you supervise or review the cost and time of a factory run. Triggers: 'supervise factory run', 'factory run bottleneck', 'optimize factory run', 'olko-factory-run-supervision'."
---

# olko-factory-run-supervision

## Routing Summary
Rules for the factory supervisor: read one run summary, report facts, the bottleneck and optimizations. Triggers: 'supervise factory run', 'factory run bottleneck', 'optimize factory run'.

## Summary fields
The factory writes the summary with a script after every run; numbers are exact, do not recompute them.
- `run`: id, workflow, goal, status (`done`, `failed`, `stopped`, `cancelled`), backend, tier models, budget.
- `totals`: `costUsd`, `budgetRatio`, `tokens`, `cacheTokens`, `llmSteps`, `scriptSteps`, `unknownCostSteps` (cost not known), `wallMs` (first to last event), `agentMs` (sum of step times).
- `nodes`: one entry per step path, most expensive first: `kind`, `tier`, `model`, `visits`, `calls` (ledger records), `agents`, `costUsd`, `costShare`, `tokens`, `inputTokens`, `outputTokens`, `wallMs`, `timeShare`, `failures`.
- `loops`: steps that ran more than once, with `visits`.
- `failures`: failed agents, steps and the run error.
- `questions`: questions to the user with `waitMs` (time until the answer; `null` when never answered).
- `clientWaits`: delegate mode only, time between offered work and its submit.
- `skipped`: steps skipped and why; `budget`: budget threshold events.
- `top`: the most expensive step, the slowest step and the longest question wait.

## Bottleneck
- Name ONE bottleneck: the step with the biggest `costShare`; when cost is unknown or near zero, the step with the biggest `timeShare`; a user question wait counts only when it is longer than all step time.
- A loop is the bottleneck when its visits together cost more than any single step.
- Write `none` when no step has more than 30% of cost or time.

## Ideas
Propose only changes the data supports. Each idea names the step, the change and the expected saving in dollars or percent.
- Cheaper tier: a `medium` or `high` step with a short output (`outputTokens` small against `inputTokens`) or a yes/no verdict.
- Fewer rounds: a loop with visits ≥ 2; lower `maxVisits` or improve the first round's input.
- Script instead of LLM: a step whose work is deterministic (counting, file checks, git, formatting, gates); suggest a `script` node.
- Smaller input: `inputTokens` much bigger than needed; pass a summary or a diff, not whole files.
- Cache: many calls with the same big input and `cacheTokens` near zero.
- Fewer questions: a question whose wait is the longest part of the run and whose answer has a default.
- Failure: a failed step that cost money before it failed; propose a cheap check before it.

## Verdict
- `ok`: no idea saves more than 10% of cost or time.
- `improve`: at least one idea saves more than 10%.
- `fix`: the run failed or stopped for a reason in the workflow (not the user's cancel), or a loop hit its limit.

## Rules
- Read only. Never change files, the workflow or the run.
- Never judge the quality of the run result; only how it spent money and time.
- Never invent numbers or steps not in the summary.
