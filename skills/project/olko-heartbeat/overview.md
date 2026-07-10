# Olko Heartbeat

## What I Do
- Find mechanism by docker compose service, container name, code name, or description.
- Trace full implementation flow across entry points, handlers, sagas, jobs, queues, HTTP/gRPC, DB writes, and external calls.
- Check observability footprint in configured logs/traces backends.
- Inspect compose logs for target and connected services.
- Supervise two full flow iterations when the trigger path is available.
- Run configured tests tied to touched source.
- Validate existing AGENTS.md docs for non-inferable mechanism knowledge.
- Suggest fixes, apply approved fixes, re-verify from scratch.
- Commit only when project adapter declares explicit commit handoff.

## When To Use
Use when user says "heartbeat X", "health-check Y", "verify Z is working", "trace the ... flow", or asks whether a service/mechanism works end-to-end.

## Inputs
- Docker compose service or container name.
- Mechanism/code name.
- Optional trigger command, API request, message publish command, or manual action needed to start the flow.

## Adaptation
Read `.agents/skill-config.md` first. If `projectAdapter: true`, load `.agents/skills/olko-heartbeat/project.md` when present. Precedence: configuration > project adapter > AGENTS.md > marketplace skill.

## Recognized Config Keys
- `composeFile`: compose file path. Default: first existing `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`.
- `logsBackend`: log backend type. Default: `loki`.
- `tracesBackend`: trace backend type. Default: `tempo`.
- `grafanaUrl`: Grafana URL. Default: `http://localhost:3000`.
- `lokiUrl`: Loki API URL. Default: `http://localhost:3100`.
- `tempoUrl`: Tempo API URL. Default: `http://localhost:3200`.
- `observabilityServices`: expected observability compose services. Default: empty; adapter should set project names.
- `testCommand`: project test command. Default: ask before running tests.
- `docsPolicyFile`: documentation policy file. Default: `ai-optimization.md` when present, else AGENTS.md rules only.
- `commitHandoffSkill`: skill to use for commit handoff. Default: none.
- `heartbeatAutoFix`: allow automatic fix implementation after user approval. Default: `false`.

## Defaults
No project-specific service names, stack names, paths, credentials, or commands are assumed. Discovery may inspect code and compose files only as needed for the user-provided heartbeat target.
