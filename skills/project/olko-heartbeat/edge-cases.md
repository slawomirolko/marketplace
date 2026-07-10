# Olko Heartbeat Edge Cases

## Target Not Found

If the target is not found, list closest matches with file paths and stop. Do not invent a mechanism from partial names.

## No Compose File

If no compose file exists and `composeFile` is not configured, continue with source analysis, tests, and docs. Report that compose/log supervision is blocked by missing compose config.

## Observability Unavailable

If Grafana, Loki, Tempo, or another configured backend is unavailable, report the failed endpoint or service and continue with compose logs and static instrumentation review. Do not mark the flow healthy solely from source analysis.

## Missing Trigger

If two iterations require an external trigger that is not configured and not provided, ask for the trigger. If the user cannot provide it, report `DEGRADED` with "runtime iteration not observed".

## Background Processes

Use bounded log tails. Stop any tail process started for supervision before finishing. Do not leave background sessions running.

## Infrastructure Services

Do not rebuild infrastructure services by default: databases, message brokers, observability collectors, trace stores, log stores, dashboards, local model servers, or other shared dependencies. Rebuild only the target service or explicitly approved dependent services.

## Project-Specific Commands

Never hardcode project-specific build, test, queue, credentials, endpoint, or service names in the marketplace skill. Put them in `.agents/skill-config.md` or `.agents/skills/olko-heartbeat/project.md`.

## Skill Reuse

Do not auto-load test, docs, or commit skills. Reuse another skill only when `.agents/skills/olko-heartbeat/project.md` declares it in `uses`.

## AGENTS.md Rules

Never create AGENTS.md files where none exist. Only update existing docs after approval. Only add non-inferable mechanism knowledge: naming quirks, config semantics, cross-boundary behavior, optional wiring, operational gotchas, and behavior that cannot be cheaply inferred from code.

## Fix Approval

Ask before applying each code or docs fix. If a fix changes behavior documented in AGENTS.md, present doc impact before editing.

## Commit Safety

Do not commit automatically. Commit handoff requires user confirmation and explicit project adapter support through `commitHandoffSkill` or `uses`.
