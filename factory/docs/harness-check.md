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
| Final output | `STATUS=done STEPS=9 COST=0.4715` |
| `/metrics` | `waitCalls` small (about 2), `statusCalls` near 0 |
| Server run state | one run, `answers: { q-endpoint: "extend" }` |

Still open: live questions in interactive UIs, and delegate mode (does a subagent result expose its token usage?).

## 5. Cleanup

```bash
docker rm -f skill-factory-poc
```
