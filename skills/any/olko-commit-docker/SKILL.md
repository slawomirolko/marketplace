---
name: olko-commit-docker
description: "Rebuild and restart docker compose services affected by committed changes. Reads the service mapping from the project adapter — never hardcodes project names. Discovers the compose file by convention. Use when olko-commit delegates docker rebuild after commit, or standalone to rebuild affected services."
---

# Olko Commit Docker

## What I do
- Map changed files to docker compose services using the project adapter's service mapping
- Discover the compose file by convention (`compose.yaml` or `docker-compose.yml`)
- Rebuild and restart affected services
- Respect the "never rebuild" list from the adapter

## When to use me
- Called by `olko-commit` (declared in `uses`) to rebuild services after committing
- Standalone: user says "rebuild services", "restart docker", "rebuild affected"

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `deploymentTarget` | — | Must be "Docker" for this skill to run. Otherwise skip. |
| `composeFile` | discover | Override compose file name. If absent, discover by convention. |

The **service mapping** and **never-rebuild list** are read from the project adapter (`.agents/skills/olko-commit-docker/project.md`), not from config. This keeps project-specific mappings out of the shared config file.

## Project adapter keys

The project adapter may define:

```yaml
# .agents/skills/olko-commit-docker/project.md

# Map changed project paths → compose service names
composeServiceMapping:
  "src/Api/**": "api"
  "src/Master/**": "master"
  "agents/**": "army"
  "src/Contracts/**": "all"        # "all" = rebuild every app service
  "src/Application/**": "all"

# Services to never rebuild (data loss risk or infrastructure)
neverRebuildServices:
  - postgres
  - rabbitmq
  - redis
  - ollama
```

If no adapter exists, or no mapping is defined, the skill cannot map files to services. Report: "No compose service mapping found in the project adapter. Skip docker rebuild."

## Workflow

### Step 1 — Discover the compose file

Search the repo root for:
1. `compose.yaml` / `compose.yml`
2. `docker-compose.yml` / `docker-compose.yaml`

If `composeFile` is set in config, use that instead. If none found, skip: "No compose file found."

### Step 2 — Map changed files to services

Using the `composeServiceMapping` from the project adapter:

1. For each changed file, find the first mapping whose path pattern matches.
2. Collect the service names. The value `"all"` means every app service (exclude `neverRebuildServices`).
3. Deduplicate the list.

If the list is empty, skip: "No docker compose services affected by these changes."

### Step 3 — Present and confirm

Present the list to the user:

```
Rebuild compose services: api, master — proceed? (y/n)
```

### Step 4 — Rebuild

If yes, for each service:

```bash
docker compose -f <compose-file> build <service> && docker compose -f <compose-file> up -d <service>
```

If any build or restart fails, report the failure and ask whether to continue or abort.

### Step 5 — Report

```
Docker rebuild complete:
  - api: rebuilt and restarted
  - master: rebuilt and restarted
  - Skipped (never rebuild): postgres, rabbitmq
```

## Rules
- Never hardcode project names, service names, or path mappings — read them from the project adapter
- Never rebuild services in the `neverRebuildServices` list
- Discover the compose file by convention, do not assume a fixed name
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-commit-docker/project.md`
