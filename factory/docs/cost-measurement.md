# Cost measurement across harnesses and models

Measured on 2026-11-10. Workflow `hello` (3 LLM nodes and 1 script node). Tiers map to different models in every run: `high` = Claude Opus 5.5 (planner), `medium` = Claude Sonnet 5.5 (implementer), `low` = Claude Haiku 5.5 (accountant). Each cell is 3 runs, so 9 LLM nodes. Harnesses: Claude Code CLI 2.1.274 and OpenCode CLI 2.2.7, both signed in with subscription accounts. All prompts are synthetic.

Prices: `src/prices.mjs`, from <https://platform.claude.com/docs/en/about-claude/pricing> (read 2026-11-10). Cache reads on Opus 5.5 and Sonnet 5.5 are 0.05x input, so Sonnet 5.5 reads cost $0.10 per MTok.

## How often is cost `unknown`?

| Mode | Harness | measured | estimated | unknown |
|---|---|---|---|---|
| `cli`: the factory runs the CLI itself and reads its JSON | Claude Code | 9 | 0 | 0 |
| `cli` | OpenCode | 6 | 3 | 0 |
| `delegate`: the harness runs nodes in its subagents, neutral prompt | Claude Code | 0 | 0 | **9** |
| `delegate`, neutral prompt | OpenCode | 0 | 0 | **9** |
| `delegate`, prompt asks for the subagent `sessionID` | OpenCode | 6 | 3 | 0 (after reading the child sessions) |
| `delegate`, neutral prompt, `factory_submit` description asks for the session id | OpenCode | 6 | 3 | **0** (after reading the child sessions) |
| `delegate`, neutral prompt, same description | Claude Code | 0 | 0 | **9** |

- `estimated` only appears when OpenCode reports cache writes. OpenCode does not say whether a write was 5-minute or 1-hour, so the factory prices it at the 5-minute rate and marks it `estimated`.
- In `delegate` mode Claude Code sent `totalTokens` for 9 of 9 nodes, but a total without an input/output/cache split cannot be priced, so it stays `unknown`.
- In `delegate` mode with a neutral prompt, OpenCode sent no usage at all. When the prompt asked for the subagent `sessionID`, it sent it for 9 of 9 nodes, and `opencode session export` gave the full split.

## Is the factory's cost correct?

`cli` mode with Claude Code: for every node and every model, the factory's cost from tokens matches the `costUSD` that Claude Code reports per model exactly (Opus, Sonnet and Haiku, 9 of 9 nodes). OpenCode reports cost 0 on a subscription, so there is no reference to compare with.

## Different models per tier

| Check | Result |
|---|---|
| `cli` + Claude Code | `modelUsage` shows `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` on the expected nodes |
| `cli` + OpenCode | each node ran on the requested `anthropic/claude-*-5-5` model |
| `delegate` + OpenCode | child sessions: agent `opus` on `claude-opus-5-5`, `sonnet` on `claude-sonnet-5-5`, `haiku` on `claude-haiku-5-5` |
| `delegate` + Claude Code | requested through the Agent tool `model` parameter; the model actually used per node was not checked in these runs |

## Cost per run (`cli` mode)

| Harness | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Claude Code | $0.2087 | $0.0109 | $0.0107 |
| OpenCode | $0.0159 | $0.0672 | $0.1164 |

Most of the cost is cache writes of the harness system prompt (about 25,000 to 28,000 tokens per call). Claude Code wrote a 1-hour cache in run 1, then read it. OpenCode kept about 5,600 tokens cached and rewrote about 21,600 tokens on 3 of 9 calls. The cause of those rewrites was not investigated.

## Consequences for the factory

1. Prefer the `cli` backend (or a direct API backend) for nodes whose cost must be known: 0 of 18 nodes were `unknown`.
2. In `delegate` mode, cost is only usable when the harness exposes a per-subagent split. OpenCode does, through the child session. Asking for the session id in the `factory_submit` tool description is enough: with a neutral prompt, OpenCode passed it for 9 of 9 nodes. Claude Code exposes only a total (in one run it passed its agent id instead, which carries no usage), so `delegate` nodes on Claude Code stay `unknown` unless the factory estimates from the total.

## Reproduce

```bash
node factory/host/cli-matrix.mjs claude,opencode 3 cli-matrix.json
FACTORY_TOKEN=... node factory/host/delegate-matrix.mjs claude,opencode 3 <work-dir>
```

`delegate-matrix.mjs` needs the factory MCP server running on `127.0.0.1:7340` (see `docs/harness-check.md`). `USAGE_HINT` adds one extra instruction to the pilot prompt.
