# Olko Heartbeat Workflow

## Step 0 - Resolve Context

Read `.agents/skill-config.md` if present. Apply marketplace defaults for missing keys. Load AGENTS.md files in scope. If `projectAdapter: true`, load `.agents/skills/olko-heartbeat/project.md` when present.

Ask what to check only when the user did not provide a target:

> Which mechanism or docker service should I heartbeat?

Accept a docker compose service/container name, a mechanism/code name, or both. If a trigger command or manual trigger is needed for two full iterations and the adapter does not define one, ask for it before supervision.

## Step 1 - Find The Mechanism

Resolve the compose file from `composeFile` or the default compose filename search. If a service/container name was provided:

1. Locate the service by compose key or `container_name`.
2. Read `build.context`, `dockerfile`, `image`, `environment`, `env_file`, `command`, `entrypoint`, `ports`, `depends_on`, networks, and volumes.
3. Use `build.context` and project files to locate source code.
4. Identify connected services:
   - target service,
   - direct `depends_on` services,
   - services that depend on the target,
   - explicitly configured observability services.

If a mechanism/code name was provided, search broadly in source and config files relevant to the repo:

- Code: `.cs`, `.py`, `.kt`, `.ts`, `.js`, `.go`, `.rs`, `.java`.
- Contracts/config: `.proto`, project files, package manifests, appsettings/config files, compose files.
- Names: class, handler, saga, queue, topic, job, endpoint, operation, service, and settings names.

If not found, list closest matches with file paths and stop.

## Step 2 - Trace The Flow

Read source files before analyzing behavior. Trace every relevant part of the mechanism:

- Entry points: controllers, jobs, message handlers, consumers, sagas, workers, CLIs, scheduled tasks.
- Orchestration: method calls, message flows, DI/container registration, middleware, retry policies.
- State changes: database writes, transaction boundaries, saga state, caches, file I/O, event publishing.
- Cross-boundary calls: HTTP, gRPC, message queues, external APIs, subprocesses, VPN/network dependencies.
- Configuration: settings types, config keys, environment variables, compose overrides.
- Error handling: result types, exceptions, retries, dead-letter queues, cancellation and timeout paths.
- Observability: logger calls, metrics, activity/span creation, correlation IDs, trace propagation.

Produce a flow graph with file and line references:

```text
[Entry Point] (path:line)
  -> [Step] (path:line)
     -> [External call / DB write / Message publish] (path:line)
```

Include every saga transition and every cross-container boundary found.

## Step 3 - Check Logs And Traces

Verify compose services:

1. Run `docker compose -f <composeFile> ps --format json` when compose is available.
2. Confirm target, connected services, and configured `observabilityServices` are running.
3. If compose is unavailable or not running, report the blocker and continue with static analysis and tests where possible.

Query logs using configured `logsBackend`. For Loki, build LogQL queries from service/container names and mechanism keywords:

```text
{container_name="<container>"} |= "<keyword>"
{container_name=~"<container-a>|<container-b>"} |= "<keyword>"
```

If direct API access is allowed, query `lokiUrl` with `query_range`. If not, ask the user to run the query in Grafana Explore and report results.

Query traces using configured `tracesBackend`. For Tempo, search by service name, operation names, trace IDs found in logs, and span names found in source instrumentation.

Compare observed logs/traces with the flow graph. Flag gaps:

- critical transition has no log,
- critical operation has no span,
- cross-service trace context missing,
- catch/error path has no error log,
- retry/dead-letter path invisible.

For each gap, present file/line and ask before editing:

> Critical path `<path>` (`path:line`) has no tracing/logging. Should I add it?

Only add instrumentation after user approval. If code changes and the adapter defines rebuild/restart commands, run them after approval.

## Step 4 - Check Compose Logs

For target and connected services, inspect recent logs:

```powershell
docker compose -f <composeFile> logs --tail=100 <service>
docker compose -f <composeFile> logs --since=5m <service>
```

Look for errors, warnings, exceptions, connection failures, timeout messages, dead-letter activity, and expected mechanism log messages.

If the project adapter defines dead-letter queue commands, run them. Otherwise infer nothing project-specific; report that DLQ checks need adapter commands.

If errors are found, summarize:

```text
Found errors in <service> logs: <summary>.
```

Ask before diagnosing or fixing when the next step may require edits.

## Step 5 - Supervise Two Flow Iterations

Tell the user:

> I'll supervise 2 full iterations of `<mechanism>`.

Use the adapter-defined trigger when present. Otherwise ask for a trigger command or manual action. Start bounded log tails for target and connected services. Avoid leaving background tails running after the step.

For each iteration:

1. Record start time.
2. Trigger or wait for the flow.
3. Watch compose logs.
4. Query logs/traces for the same time window.
5. Match observed events against the flow graph.
6. Record completion, errors, and elapsed time.

Report:

```text
Flow supervision (2 iterations):
  Flow 1: log steps complete=<yes/no>, traces complete=<yes/no>, errors=<summary>, timing=<duration>
  Flow 2: log steps complete=<yes/no>, traces complete=<yes/no>, errors=<summary>, timing=<duration>
  Issues: <list or "none">
```

If two iterations cannot be observed, report the exact blocker and the verification that was still possible.

## Step 6 - Run Tests

Map traced source files to test projects or test paths using project config, project adapter, and repo conventions. Prefer `testCommand` from config. If absent, ask before running tests.

Run the narrowest reliable tests connected to the mechanism. If no narrow test target is clear, ask whether to run the broader configured test command.

If tests fail, report command, failing test names, first relevant error, and suspected source path. Do not hide failures behind summary text.

## Step 7 - Check AGENTS.md Docs

Validate existing AGENTS.md files only. Never create new AGENTS.md files.

If `docsPolicyFile` exists, follow it. Otherwise use this rule: only flag missing or stale non-inferable content. Do not require structural overviews, flow graphs, property tables, dependency lists, file indexes, or test file tables.

Check relevant docs in this order:

1. Slice/module-level AGENTS.md near the mechanism.
2. Project/service-level AGENTS.md.
3. Root AGENTS.md.
4. Cross-cutting docs named by the adapter.

Verify:

- mechanism name coverage,
- configuration keys and environment variables that are non-obvious,
- naming mismatches and cross-boundary quirks,
- optional wiring and operational gotchas,
- behavior accuracy versus code.

Report:

```text
AGENTS.md coverage:
  <file> - missing/stale: <non-inferable gaps>
  <file> - OK
```

Ask before doc edits.

## Step 8 - Diagnose And Fix

Collect issues from logs, traces, tests, docs, and source analysis. For each issue:

```text
Issue: <description>
Root cause: <explanation, path:line>
Suggested fix: <change>
```

Ask before applying each fix. Before a code fix, check whether existing AGENTS.md docs describe the affected mechanism. If yes, present doc impact:

```text
AGENTS.md impact:
  Affected docs: <files/sections>
  Why: <behavior/config/contract change>
  Proposed doc update: <brief change>
```

Then ask whether to apply the fix with docs, apply code only, or skip.

Track all changed files. Preserve unrelated user changes.

## Step 9 - Re-Verify

If any fix was applied:

1. Rebuild/restart only target services when adapter commands exist and the user approves.
2. Wait for health checks or configured stabilization.
3. Return to Step 1 and repeat the heartbeat enough to verify the changed path.
4. Re-run failed tests or the configured relevant test set.
5. Re-check changed docs.

Do not rebuild infrastructure services unless the adapter explicitly says the target is safe and the user approves.

## Step 10 - Commit Handoff

If files changed, commit only when `commitHandoffSkill` is configured by the project adapter or `.agents/skill-config.md`, and user asks for commit or confirms commit handoff. Do not auto-load another skill unless explicit `uses` in the project adapter allows it.

If no commit handoff is configured, report changed files and leave commit to the user.

## Step 11 - Summary

Finish with:

```text
Heartbeat: <mechanism/service>
------------------------------------------------
Flow graph: <brief tree>
Logs/traces: <found/gaps/fixed>
Compose logs: <healthy/errors/fixed>
Tests: <passed/failed/not run and why>
AGENTS.md: <complete/updated/gaps remain>
Changes: <files changed>
------------------------------------------------
Status: HEALTHY / DEGRADED (<issues>) / NEEDS FIX (<blockers>)
```
