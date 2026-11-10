# Harness check

Manual check that a real harness can drive the factory as a thin MCP client. Use synthetic data only. The factory uses a fake model, so it calls no LLM; each harness still uses its own model to call the tools, billed to the account it is signed in with.

## 1. Start the server (localhost only)

```bash
export FACTORY_TOKEN=$(openssl rand -hex 24)
MSYS_NO_PATHCONV=1 docker run -d --name skill-factory-poc --read-only --tmpfs /tmp --tmpfs /data:uid=10001 \
  --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:7340:7340 \
  -e FACTORY_HOST=0.0.0.0 -e FACTORY_TOKEN -e FACTORY_TURN_DELAY_MS=300 \
  --entrypoint node skill-factory-poc:0.2 src/server.mjs
```

Run each harness from an empty temporary folder, not from a repository.

## 2. Point the harness at the server

Claude Code, headless, without changing user config (`mcp.json` in the temp folder):

```json
{ "mcpServers": { "factory": { "type": "http", "url": "http://127.0.0.1:7340/mcp",
  "headers": { "Authorization": "Bearer ${FACTORY_TOKEN}" } } } }
```

```bash
claude -p --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__factory" --model haiku --output-format json < prompt.txt
```

OpenCode V2 (`@opencode/cli`), `opencode.json` in the temp folder:

```json
{ "mcp": { "servers": { "factory": { "type": "remote", "url": "http://127.0.0.1:7340/mcp", "oauth": false,
  "headers": { "Authorization": "Bearer {env:FACTORY_TOKEN}" } } } } }
```

```bash
opencode run --standalone --archived --format json -m anthropic/claude-haiku-5-5 "$(cat prompt.txt)" < /dev/null
```

`opencode run` waits on stdin when it is not a terminal, so close it (`< /dev/null`). The first V2 run can fail with `Location plugins did not finish activating` while plugins load; retry after a minute.

Codex (not verified yet), config overrides only for this run:

```bash
codex exec --json --ephemeral --skip-git-repo-check -s read-only -c 'approval_policy="never"' \
  -c 'mcp_servers.factory.url="http://127.0.0.1:7340/mcp"' -c 'mcp_servers.factory.bearer_token_env_var="FACTORY_TOKEN"' - < prompt.txt
```

## 3. Prompt (`prompt.txt`)

```text
You are testing an MCP server named "factory". Use only its tools.
Start a run with goal "hello" and idempotencyKey "<harness>-1". The user has already approved the proposal, so confirm it without overrides.
Then follow the "next" hint in each factory response until the run finishes. If the run asks a question, the user's answer is "extend".
At the end get the report and the trace.
Finally print exactly: RUN=<runId> STATUS=<status> STEPS=<cost.steps> COST=<cost.costUsd>
```

## 4. What to check

```bash
curl -s -H "Authorization: Bearer $FACTORY_TOKEN" http://127.0.0.1:7340/metrics
```

| Check | Expected |
|---|---|
| Final output | `STATUS=done STEPS=13 COST=0.54073` (sample workflow with four review agents) |
| `/metrics` | `waitCalls` small (about 2), `statusCalls` near 0, `throttledWaitCalls` 0 |
| Server run state | one run, `answers: { q-endpoint: "extend" }` |

`throttledWaitCalls` counts `factory_wait` calls on a run that is not running that came closer than the minimum interval (500 ms). A value above 0 means the client kept calling after the run ended.

## Results after the tool text update (2026-11-10)

Tool descriptions and `next` hints were rewritten from the prompt optimizer review. One or two runs per row, so these show behaviour, not rates.

| Mode | Harness | Result |
|---|---|---|
| thin client | Claude Code 2.1.319, Haiku | done, 13 steps, 2 `factory_wait`, 0 `factory_status` |
| thin client | OpenCode 2.2.7, Haiku, first run | done, but **49** `factory_wait`: its loop stopped on `finished`/`completed`, not `done`, so it kept waiting on the ended run |
| thin client | OpenCode 2.2.7, Haiku, 2 runs after naming the end statuses in `factory_wait`/`factory_status` and throttling waits on ended runs | done, 2 `factory_wait` each, 0 throttled |
| delegate | OpenCode, Opus/Sonnet/Haiku subagents | `sessionID` passed for 7 of 7 nodes, 0 of 7 `unknown` (all `estimated`) |
| delegate | Claude Code, same models | 7 of 7 `unknown` (only total tokens; one agent id) |
| delegate | OpenCode, after the hint asks for `agentId` | `agentId` passed in 7 of 7 `factory_submit` calls, `sessionID` 7 of 7, 0 `unknown` |
| interactive | OpenCode 2.2.7 TUI, Haiku, a person answering | the TUI showed the proposal and waited for approval, then asked "New endpoint or extend the existing one?" and waited; the person answered `extend` about 18 s later; run done, 13 steps, 2 `factory_wait`, 0 `factory_status` |

Interactive OpenCode needs `opencode --standalone` in the folder that holds `opencode.json`: the plain TUI talks to the background OpenCode service, which did not have the `factory` server (or `FACTORY_TOKEN`) and reported no factory tools.

| interactive | Claude Code 2.1.319, Haiku, a person answering | showed the proposal and waited for approval, asked the node question and waited; the person answered `extend` about 8 s later; run done, 2 `factory_wait`, 0 `factory_status` |
| thin client | OpenCode 2.2.7, Haiku, neutral prompt, factory with the run page | done; the client ended its answer with `Viewer: http://127.0.0.1:7340/viewer/?run=<runId>` without being asked |

Interactive Claude Code asks whether you trust the folder on the first start; answer that yourself.

## 5. Cleanup

```bash
docker rm -f skill-factory-poc
```
