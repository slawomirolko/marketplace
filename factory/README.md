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
| `factory_install_guide(harness?)` | steps, commands and config entry to install the factory in a harness |

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

## Install

Claude Code (one step, from the Olko marketplace):

```text
/plugin install skill-factory --marketplace slawomirolko/marketplace
```

The plugin declares the MCP server `factory` (`node ${CLAUDE_PLUGIN_ROOT}/dist/stdio.mjs`). Claude Code starts it by itself in every session; there is no install step, no Docker and no token. `dist/` and `app/dist/` are committed build output, so the plugin needs only Node (22.18 or newer runs the bundle; development uses 26.13).

OpenCode: run once `node factory/dist/install-opencode.mjs` (from a clone or from the Claude Code plugin folder). It adds a `factory` local server to `~/.config/opencode/opencode.json` in the shape the file already uses, keeps a `.bak-<time>` copy, and does nothing when the entry is already there. Pass another config path as the first argument.

Ask the factory: the MCP tool `factory_install_guide(harness?)` returns the exact steps, commands and config entry to install the factory permanently in `claude-code`, `opencode`, `codex` or any other MCP client (`other`). Without `harness` it uses the client that is connected (MCP `clientInfo.name`). The paths in the answer point to the running copy of the factory. When Claude Code already runs it from the plugin, the answer says that nothing is needed. The tool only describes the steps; the client runs them after the user agrees.

What happens at start (`src/stdio.ts`):
- The harness talks to the factory over stdio, so only that harness can reach the tools.
- Runs are stored in `~/.skill-factory` (`FACTORY_DATA_DIR` changes it), shared by all harnesses. A run is resumed only by the process that owns it, or after that process has died.
- If nothing answers on `127.0.0.1:7340` (`FACTORY_VIEWER_PORT`), the factory starts the run page (`src/viewer-server.ts`) as a separate background process, so the page keeps working after the harness session ends. Its process id is in `~/.skill-factory/viewer.pid`.
- The default backend is `delegate`; `FACTORY_BACKEND=fake` selects the fake test model.

After a change, `pnpm build` (from `factory/`) rebuilds `app/dist` and `dist`; commit both.

## HTTP server and the run page

`node factory/setup.ts` builds the viewer and the Docker image (`skill-factory-poc:0.3`) for the HTTP variant (`src/server.ts`, bearer token, used by the container tests and LangGraph). That server serves the same run page at `http://127.0.0.1:7340/viewer/`. Every response that has a `runId` also has `viewerUrl` (`/viewer/?run=<runId>`), and the end hint and the `factory_report` description tell the client to show it to the user. `FACTORY_PUBLIC_URL` changes the base when the port is mapped differently.

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

`workflows/olko-review.yaml` runs the REVIEW ROUTE of `agents/opencode/olko-review-orchestrator.md`: `route` (input `plan` → PLAN ROUTE; own PR → FEEDBACK ROUTE unless input `fresh: true` asks for a fresh review; else REVIEW), `scope` (`gh pr view` + `gh pr diff`, stale working tree flagged), `detect` (bugs lens, one stack lens per detected stack, `olko-review-requirements-lens` when the PR description gives criteria), `memory` (agent memory block; missing block asks continue or stop), `lenses` in parallel, `merge`, `verify`, `confirm`, `rules-check` (`olko-project-rules-check`; `no-store` skips), store violations verified and decided one question each, `rank`, one question per confirmed finding (post or skip, one `gh pr comment` per post) and `memory-save` (`confirmed:`/`rejected:` lines). Generated lockfiles are not sent to the lenses. PLAN ROUTE: `plan-read` (a file in the workspace, optional `criteria`), `olko-review-requirements-lens` in plan mode, verifier, project rules check with store decisions, report with `plan:` lines; no memory. FEEDBACK ROUTE: CI state and unresolved comments (`gh pr checks`, review threads), one `olko-review-feedback-handler` assessment and one decision per item, the implement question, then one reply draft and one post question per wont-fix or question item. Fixing code is not available yet (it needs write-capable agents). The report text is in `factory_report.result`.

`workflows/olko-marketplace-skill-sync.yaml` runs phases 1–3 of `agents/opencode/olko-marketplace-skill-sync-manager.md` for the project in input `project`: `resolve-path` (input `marketplace`, `MARKETPLACE_PATH`, project adapter, fallback with a question), `memory`, `olko-marketplace-skill-bootstrapper` (read and bash), `safe-source` (clean worktree, `main` with a question to switch, `fetch`, `pull --ff-only`; anything else stops the run), `discover` (`.agents/skills`, `.opencode/agents`, optional input `artifacts`), the skill `olko-adapt-to-marketplace --local-only` per local skill (read and edit), a SemVer check, one `olko-marketplace-skill-sync-comparator` per artifact in parallel with the marketplace checkout in `dirs`, and one decision per non-identical artifact with options from its classification. Applying accepted decisions, publishing and installing are not in the factory yet: the run stops with an error before any change.

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

## Workflows in YAML

Every workflow is a YAML file in `workflows/` (`FACTORY_WORKFLOWS_DIR` changes the folder), validated against `spec/workflow.schema.json` when the factory starts. No workflow is defined in code. A file has `name`, `version`, `source`, `roles` (role to tier), `entry`, `nodes`, `edges` and optional `limits.maxCycleIterations` (default 3).

| Node kind | Fields | What the engine does |
|---|---|---|
| `llm` | `role`, `prompt` (Mustache: `goal`, `input`, `state`, `agent`, `answer`, `steps`), `agent` or `skill` or `agents` or `agentsFrom: state.<path>`, optional `parse`, `tools` (`read`, `edit`, `bash`; default `read`), `dirs` (Mustache paths the agent may use besides the workspace) | runs each agent through the backend (`cli`, `delegate`), prices its tokens, stores the parsed output in `state.<node id>.<agent id>` |
| `script` | `op` (a named operation), `with` (its arguments) | runs the operation, stores its result in `state.<node id>` |
| `interrupt` | `question` (`id`, `text`, `allowed` or `allowedFrom: state.<path>`) | stops the run and asks the user; the answer goes to `state.<node id>.answer` |
| `subgraph` | `workflow` | inlines that workflow; its node paths are `<workflow>/<node>/<sub-node>` |

An edge has `from`, `to` (a node id or `END`) and an optional `when`: `<state path> <operator> <value>` with `==`, `!=`, `>`, `<`, `>=`, `<=`; a list compares by its length. The first edge whose condition holds is taken. A node that would run more often than `maxCycleIterations` fails the run.

Code exists only for named operations (`src/ops.ts`: `list.next`, `memory.load`, `memory.persist`, `github.prScope`, `github.postComment`, `review.*`, `sync.*`, `builtin.pass`) and parsers (`review.findings`, `review.verdicts`, `review.rulesCheck`, `sync.comparison`). An interrupt question `id` and `text` are Mustache templates, so a loop over a list (`list.next` plus an edge back) asks one question per item; `maxVisits` on a node allows the loop to run more often than `limits.maxCycleIterations`. Agents of one LLM node run in parallel (`parallel`, default 10); in delegate mode the client gets all of them at once in `pendingWorkItems`, each with `agentName` and `agentInstructions` from the marketplace agent file (or, for a `skill` node, from the skill's `SKILL.md`), `tools` and `dirs`, so no harness needs the agent installed. The run workspace is input `project`, else `FACTORY_WORKSPACE`, else the factory's working directory. Agent and skill definitions are read from the marketplace checkout (`FACTORY_MARKETPLACE_DIR`, default the repository that contains the factory) at every agent step, so a change in the marketplace reaches the next step without a restart and nothing is installed. The skills an agent declares (`permission.skill` allow entries and its `skills` in `agents/opencode/index.json`) are listed in its instructions with their marketplace `SKILL.md` paths and added to `dirs`; the Skill tool is never allowed, so installed copies are never used.

Configuration: `config/factory.yaml` (`FACTORY_CONFIG` changes it), validated against `spec/factory-config.schema.json`: roles to tiers, backends and budget. It names no model; the proposal at run start shows the tier-to-model map and the user confirms or changes it. `docs/yaml-migration-plan.md` lists the workflows still to move.

## Layout

```text
factory/
  src/engine.ts        outer loop, sample workflow, ledger, checkpoints, budget
  src/server.ts        MCP server, auth, wait and throttle
  src/spec.ts          schema validation for config, workflow, ledger, footer
  spec/                 JSON Schemas and examples
  workflows/            workflows in YAML (olko-review, olko-marketplace-skill-sync, hello sample)
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
| Node MCP client (offline, Node 26.13) | 15/15 scenario tests, 52/52 unit tests (incl. stdio end to end on the bundle, Node 24 and 26), restart resilience |
| LangGraph 1.2 host, `langchain-mcp-adapters` 0.3.2 and `langchain[mcp]` 1.4 | run completes, questions map to `interrupt()` |
| Claude Code CLI 2.1.274, headless | run completes, 2 `factory_wait` calls, 0 status polls |
| OpenCode CLI 2.2.7, headless | run completes, 2 `factory_wait` calls, 0 status polls |
| Claude Code 2.1.322, plugin loaded with `--plugin-dir` | Claude Code started the factory over stdio by itself; run done, link shown; the run page kept working after Claude Code exited |
| OpenCode 2.2.7, local `factory` server in `opencode.json` | OpenCode started the factory over stdio; run done, per-agent cost table and link shown |
| Claude Code 2.1.322, delegate with real Opus/Sonnet/Haiku 5.5 subagents (HTTP) | run done, link shown; per-step cost `unknown` because Claude Code does not pass subagent tokens |

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
- Installation from the published marketplace (tested with `claude --plugin-dir` and a local OpenCode config), long runs, desktop apps.
