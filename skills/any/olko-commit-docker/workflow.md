# Olko Commit Docker

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
