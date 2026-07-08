# Olko Commit Docker

## Overview

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
