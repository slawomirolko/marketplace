# Skill factory (proof of concept)

A harness-agnostic "software factory": one outer loop that owns the workflow graph, model tiers, user questions and cost, exposed over MCP. Harnesses (Claude Code, Codex, OpenCode, LangGraph) only act as thin clients: they start a run, relay questions to the user and show the report.

Status: **proof of concept**. The model is a deterministic fake, so `costUsd` in factory responses is synthetic. Nothing here calls a real LLM.

## Design decisions

- The graph lives inside the factory. Clients call `factory_start(goal)`; they never send a graph.
- Configuration has no model names. Roles map to tiers (`low`, `medium`, `high`); the tier-to-model mapping is proposed at run start and confirmed by the user.
- Only the outer loop talks to the user. A node that needs input returns `needs_input`; the run moves to `waiting_for_user` and resumes from a checkpoint after `factory_answer`.
- Every response carries a cost footer (cost, budget ratio, tokens, steps, per-node cost, source). Budget thresholds: 50% info, 80% pause and ask, 100% stop.
- Runs are asynchronous. Clients call `factory_wait` (server-side long poll) instead of looping on `factory_status`; `factory_status` calls closer than 500 ms per run are delayed by the server.
- Tools are idempotent where a client may retry: `factory_start` with `idempotencyKey`, `factory_answer` per `questionId`.

## MCP tools

| Tool | Purpose |
|---|---|
| `factory_start(goal, idempotencyKey?)` | create a run, return the proposal to confirm |
| `factory_confirm(runId, overrides?)` | accept or change role tiers and budget, start the run |
| `factory_wait(runId, timeoutSec?)` | block until the run needs the user or finishes (max 50 s) |
| `factory_status(runId)` | current state, `pendingQuestion`, `next` hint, `retryAfterMs`, cost footer |
| `factory_answer(runId, questionId, answer)` | answer the pending question |
| `factory_report(runId)` | steps, tokens and cost per node and tier |
| `factory_trace(runId)` | trace tree with nested node paths and events |
| `factory_cancel(runId)` | cancel the run |

Transport: streamable HTTP at `/mcp`, bearer token required (`FACTORY_TOKEN`), state and ledger under `FACTORY_DATA_DIR`.

## Layout

```text
factory/
  src/engine.mjs        outer loop, sample workflow, ledger, checkpoints, budget
  src/server.mjs        MCP server, auth, wait and throttle
  test/scenario.mjs     MCP client scenario tests
  test/restart.mjs      kill + restart resilience test
  py/langgraph_client.py  LangGraph host (legacy and new LangChain MCP API)
  docs/harness-check.md   manual check with real harnesses
  Dockerfile, run-tests.sh
```

## Run the tests

Tests run in a container without network access:

```powershell
docker build -t skill-factory-poc:0.2 factory
docker run --rm --network none --read-only --tmpfs /tmp --tmpfs /data:uid=10001 --cap-drop ALL --security-opt no-new-privileges skill-factory-poc:0.2
```

## Verified so far

| Client | Result |
|---|---|
| Node MCP client (offline) | 13/13 scenario tests, restart resilience |
| LangGraph 1.2 host, `langchain-mcp-adapters` 0.3.2 and `langchain[mcp]` 1.4 | run completes, questions map to `interrupt()` |
| Claude Code CLI 2.1.274, headless | run completes, 2 `factory_wait` calls, 0 status polls |
| OpenCode CLI 2.2.7, headless | run completes, 2 `factory_wait` calls, 0 status polls |

Findings:
- The legacy `langchain-mcp-adapters` and `langchain[mcp]` cannot share one Python environment (the new one pulls `mcp` 2.x).
- OpenCode V2 is published as `@opencode/cli`; `opencode-ai` stops at 1.19.x. V2 reaches MCP tools through its `execute` code tool, which produced a tight polling loop before `factory_wait` and the throttle existed.
- Harness-reported cost is not comparable across harnesses (list price vs. 0 on a subscription), so the factory must compute cost from tokens itself.

## Not verified yet

- Codex as a client.
- Delegate mode: running nodes in harness subagents with a per-tier model and reporting their usage.
- Real models inside the factory (`api` mode) and real cost.
- Live user questions in interactive harness UIs (tests answered through the prompt).
- Installation from marketplaces, long runs, desktop apps.
