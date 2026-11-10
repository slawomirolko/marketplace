# Skill factory (proof of concept)

A harness-agnostic "software factory": one outer loop that owns the workflow graph, model tiers, user questions and cost, exposed over MCP. Harnesses (Claude Code, Codex, OpenCode, LangGraph) only act as thin clients: they start a run, relay questions to the user and show the report.

Status: **proof of concept**. By default the factory hands each LLM step to the client's own subagent (`delegate` backend, tiers mapped to `claude-haiku-5-5` / `claude-sonnet-5-5` / `claude-opus-5-5`), or runs a signed-in CLI (`cli` backend). The deterministic fake model is used only when asked for (`FACTORY_BACKEND=fake`, the offline tests); its reports carry `synthetic: true` and the run page marks them "fake model".

Stack: Node 26.13 LTS (TypeScript run directly with type stripping), TypeScript 7 strict (`pnpm typecheck`), pnpm 12 workspace with one lockfile, MCP SDK 1.32, zod 4, Ajv 8; run page: React 19.3, React Flow 12.12, dagre 3.1, Vite 8.3. Dependencies are pinned exactly.

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

## Specification

JSON Schemas (draft 2020-12) in `spec/`, validated by `src/spec.ts` (Ajv plus graph and role checks):

| Schema | Describes |
|---|---|
| `factory-config.schema.json` | backends (`api`, `cli`, `harness`, `delegate`), role-to-tier map, budget. No model names, keys only as env var names. |
| `workflow.schema.json` | nodes (`llm`, `script`, `interrupt`, `subgraph`, `map`), edges with conditions, cycle limits |
| `usage-record.schema.json` | one ledger line; `costSource` is `measured`, `reported`, `estimated` or `unknown` (then `costUsd` is null) |
| `cost-footer.schema.json` | the footer in every response, with `scope: "factory-run"` and `factoryRunCostUsd`-style names so a client model does not mix it up with its own budget |

`spec/examples/valid` and `spec/examples/invalid` hold examples checked by `test/spec.test.ts`. The PoC server still emits the older footer field names; moving it to this schema is the next step.

## Setup and the run page

```bash
node factory/setup.ts
```

Installs the viewer dependencies (`pnpm install --frozen-lockfile`), builds the viewer (`vite build`) and builds the factory image (`skill-factory-poc:0.3`), then prints the `docker run` command. The factory server serves the built viewer at `http://127.0.0.1:7340/viewer/`, reading the same runs as the MCP endpoint. Every response that has a `runId` also has `viewerUrl` (`/viewer/?run=<runId>`), and the end hint and the `factory_report` description tell the client to show it to the user. `FACTORY_PUBLIC_URL` changes the base when the port is mapped differently.

The run page needs no MCP token. It is read-only (GET), answers only requests whose Host is the factory's own local address (protection against DNS rebinding), and sends a Content-Security-Policy with a new nonce per request. The page shows prompts and agent outputs, so keep the port bound to 127.0.0.1.

## Viewer app

One command, from `factory/`:

```bash
pnpm viewer
```

After `pnpm install` (once, from `factory/`) it starts Vite on <http://127.0.0.1:5180> and opens the browser. The app (`app/`, React + React Flow + dagre, all MIT) shows:

- the workflow graph: subgraphs and nodes with several agents are collapsible groups (collapsed groups show their total cost);
- per node and per agent: role, tier, model, cost, tokens, steps and cost source; an unknown cost is shown as "unknown", never as $0;
- on click, a side panel with the agents table, every ledger record (input, output, cache tokens, cost, source), the question to the user and its answer, and the last output preview;
- a run selector and run totals by tier, model and cost source.

Data comes read-only from the factory data directory. Without `FACTORY_DATA_DIR` the app uses `factory/.viewer-data` (git-ignored) and creates one finished demo run with the fake model on first start. To look at real runs, set `FACTORY_DATA_DIR` to the directory the factory writes to (it holds `runs/*.json`). The Vite server listens on 127.0.0.1 only and serves GET requests only. HTML responses carry a Content-Security-Policy with a new nonce per request (`app/csp.ts`): no unsafe-inline, no unsafe-eval.

## Real workflow: olko-review

`src/workflows/olko-review.ts` runs the REVIEW ROUTE of `agents/opencode/olko-review-orchestrator.md` through the factory: `scope` (`gh pr view` + `gh pr diff`), `detect` (changed paths to lenses), `memory` (not loaded in the PoC, stated in the report), `lenses` (one OpenCode agent per detected stack, chosen at run time), `merge`, `verify` (`olko-review-verifier`, skipped without findings) and `rank` (tiers and report). Each LLM node runs the real marketplace agent with `opencode run --agent <name>`; the agent files are copied to a temporary `OPENCODE_CONFIG_DIR`, so nothing is installed globally. Generated lockfiles are not sent to the lenses.

```bash
node factory/host/review-run.ts 74 opencode/deepseek-v4.1-flash-free
```

The run is written to `factory/.viewer-data` and shows up in the viewer app.

The sample workflow has a `review` node with four agents (`security`, `style`, `tests`, `docs`); the ledger records `agentId` and `factory_report` returns `byNode[path].byAgent`.

## Mermaid export

`viewer/` draws a workflow as a Mermaid flowchart: nodes, subgraphs as clusters, edge conditions, role to tier, and (for a run) the model, cost, tokens, steps and cost source of every node. A node whose cost is `unknown` shows "$ unknown" with a red dashed border, never $0.

```bash
node factory/viewer/demo-report.ts report.json                 # fake run, offline
node factory/viewer/render.ts --report report.json --out hello-run
node factory/viewer/render.ts --root feature --workflows factory/spec/examples/valid --out feature
```

Each call writes `<out>.mmd`, `<out>.md` (a Mermaid block that GitHub renders) and `<out>.html` (zoom with the mouse wheel or buttons, drag to pan). `--report` takes the JSON of `factory_report`. The HTML page loads `mermaid@12.3.0` (MIT) and `@panzoom/panzoom@4.6.2` (MIT) from jsDelivr; there is no build step and no server.

`workflows/hello.json` and `workflows/hello-build.json` describe the graph the engine runs in the workflow schema format. The engine still keeps its prompts and turn counts in code; `test/viewer.test.ts` checks that both have the same node paths.

## Layout

```text
factory/
  src/engine.ts        outer loop, sample workflow, ledger, checkpoints, budget
  src/server.ts        MCP server, auth, wait and throttle
  src/spec.ts          schema validation for config, workflow, ledger, footer
  spec/                 JSON Schemas and examples
  workflows/            sample workflow in the workflow schema format
  app/                  viewer app (Vite + React Flow), read-only data API in app/data.ts
  viewer/               Mermaid diagram of a workflow, with per-node cost from a run report
  test/spec.test.ts    schema tests
  test/viewer.test.ts  viewer and per-node cost tests
  test/scenario.ts     MCP client scenario tests
  test/restart.ts      kill + restart resilience test
  py/langgraph_client.py  LangGraph host (legacy and new LangChain MCP API)
  docs/harness-check.md   manual check with real harnesses
  Dockerfile, run-tests.sh
```

## Run the tests

Tests run in a container without network access:

```powershell
docker build -t skill-factory-poc:0.3 factory
docker run --rm --network none --read-only --tmpfs /tmp --tmpfs /data:uid=10001 --cap-drop ALL --security-opt no-new-privileges skill-factory-poc:0.3
```

Schema tests only (mounting the sources into the image):

```powershell
docker run --rm --network none -v "${PWD}/factory/spec:/app/spec:ro" -v "${PWD}/factory/src:/app/src:ro" -v "${PWD}/factory/test:/app/test:ro" --entrypoint node skill-factory-poc:0.3 --test /app/test/spec.test.ts
```

## Verified so far

| Client | Result |
|---|---|
| Node MCP client (offline, Node 26.13) | 15/15 scenario tests, 50/50 unit tests, restart resilience |
| LangGraph 1.2 host, `langchain-mcp-adapters` 0.3.2 and `langchain[mcp]` 1.4 | run completes, questions map to `interrupt()` |
| Claude Code CLI 2.1.274, headless | run completes, 2 `factory_wait` calls, 0 status polls |
| OpenCode CLI 2.2.7, headless | run completes, 2 `factory_wait` calls, 0 status polls |

Findings:
- The legacy `langchain-mcp-adapters` and `langchain[mcp]` cannot share one Python environment (the new one pulls `mcp` 2.x).
- OpenCode V2 is published as `@opencode/cli`; `opencode-ai` stops at 1.19.x. V2 reaches MCP tools through its `execute` code tool, which produced a tight polling loop before `factory_wait` and the throttle existed.
- Harness-reported cost is not comparable across harnesses (list price vs. 0 on a subscription), so the factory must compute cost from tokens itself.
- Real models per tier (Opus / Sonnet / Haiku 5.5) through the `cli` backend and through `delegate` subagents: 0 of 18 `cli` nodes had unknown cost; 18 of 18 `delegate` nodes did with a neutral prompt. Details in `docs/cost-measurement.md`.

## Backends

- `delegate` (default): the client runs `pendingWork` in its own subagent and calls `factory_submit`.
- `fake`: deterministic fake model, only with `FACTORY_BACKEND=fake` (offline tests). Costs are synthetic and the report says so (`synthetic: true`).
- `cli`: the factory runs a signed-in CLI headless per node (`host/cli-backend.ts`, prompt on stdin) and prices tokens with `src/prices.ts`. It needs the CLIs on the same machine, so it runs on the host (`host/cli-matrix.ts`), not in the container.

## Not verified yet

- Codex as a client.
- Delegate mode on Claude Code: the model actually used by each subagent was not checked.
- Direct API backend (`api` kind in the config schema).
- Live user questions in interactive harness UIs (tests answered through the prompt).
- Installation from marketplaces, long runs, desktop apps.
