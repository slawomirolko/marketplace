---
name: olko-docker-style
description: "Check Dockerfile, .dockerignore, and Docker Compose conventions for changed container files with marketplace defaults. Reads project docs/adapters, verifies multi-stage .NET Dockerfiles, pinned base images, layer caching, non-root runtime users, healthchecks, exec-form entrypoints, minimal runtime images, build-context exclusions, compose secrets, healthchecks, restart policies, volumes, networking, and reports violations with rule sources. Use when validating Docker/container changes, before commit/test gates, or when olko-commit-style/olko-test delegates Docker checks."
---

# Olko Docker Style

## What I do
- Map changed Docker files to the repo root or nearest configured container context.
- Read Docker rules from `.agents/skill-config.md`, `.agents/skills/olko-docker-style/project.md`, scoped `AGENTS.md`, `DOCKER.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Check marketplace Docker defaults unless project docs override them.
- Inspect Dockerfile, `.dockerignore`, and Compose changes for security, reproducibility, cache behavior, and runtime safety.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `dockerStyleCommand` | - | Command to verify Docker conventions. |
| `dockerComposeCommand` | `docker compose config` | Command to validate Compose syntax when a compose file changes. |
| `dockerRoot` | repo root | Override Docker context root. |
| `dockerDocs` | `DOCKER.md`, `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` | Docker rule docs to read when present. |
| `dockerApplicationHealthPath` | `/health` | Default HTTP health endpoint for app containers. |
| `dockerHttpHealthPort` | `5000` | Default app health port when docs do not override it. |

## Marketplace defaults

Use these defaults only when config, adapter, or project docs do not override them.

### Dockerfile conventions
- Application Dockerfiles for .NET services must use multi-stage builds: SDK image for build/publish and ASP.NET runtime image for execution.
- Separate build dependencies from runtime dependencies.
- Do not leave the SDK image in the final runtime stage.
- Pin every base image to a specific tag. Do not use `latest`.
- .NET production runtime images should use `mcr.microsoft.com/dotnet/aspnet:<version>`, not SDK.
- Copy dependency metadata before source code for layer caching: `Directory.Packages.props`, project files, restore, then `COPY . .`, then publish.
- Do not run `COPY . .` before dependency restore when the project can restore from copied metadata.
- Runtime stage must run as a non-root user. Create or select a dedicated runtime user and set `USER` before `ENTRYPOINT`.
- Every production application Dockerfile must include `HEALTHCHECK`.
- HTTP apps should use the documented health endpoint, defaulting to `/health` when docs do not specify one.
- Use exec-form `ENTRYPOINT`, for example `["dotnet", "App.dll"]`.
- Do not use shell-form `ENTRYPOINT`.
- Install only runtime packages that are strictly needed.
- Chain package install cleanup: `apt-get update && apt-get install -y --no-install-recommends ... && rm -rf /var/lib/apt/lists/*`.
- Use `COPY` instead of `ADD` unless the side effects of `ADD` are explicitly required and documented.
- Do not hardcode secrets or environment-specific config values in Dockerfiles.

### .dockerignore conventions
- Root `.dockerignore` should exclude Git history and CI metadata: `.git/`, `.github/`.
- Exclude secret material: `.env`, `*.env`, `secrets.dev.yaml`.
- Exclude build artifacts and dependency caches: `bin/`, `obj/`, `node_modules/`, `testresults/`, `TestResults/`, `__pycache__/`, `.venv/`, `.pytest_cache/`.
- Exclude Compose and Dockerfile definitions from app build contexts unless docs require them.
- Exclude non-build documentation/config such as `README.md`, `LICENSE`, and `NuGet.Config` unless needed for restore/build.
- Exclude `.dockerignore` itself when the project docs require a minimal context.
- Do not allow secrets into any Docker build context.

### Docker Compose conventions
- Secrets must live in the root `.env` or documented secret store, not hardcoded in Compose `environment` blocks.
- Services that need secrets should reference `env_file: ./.env`.
- Non-secret defaults may remain in `environment`.
- HTTP services should have Compose-level `healthcheck`.
- Infrastructure services should use native health checks such as `pg_isready` or `rabbitmq-diagnostics`.
- `depends_on` should use `condition: service_healthy` when startup order depends on readiness.
- Slow-boot services should set `start_period`.
- Services should set `restart: unless-stopped` unless docs require another policy.
- Browser/scraping services should set `shm_size: 2gb` when docs identify them as browser workloads.
- Use named volumes for persistent data.
- Bind-mounted config files should be read-only with `:ro`.
- Use Compose service names for container-to-container communication.
- Use `host.docker.internal` only for container-to-host callbacks.
- Do not hardcode IP addresses in Compose or service configuration.
- Map only necessary ports to the host.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep:
- `Dockerfile`, `Dockerfile.*`, `*.Dockerfile`
- `.dockerignore`, `**/.dockerignore`
- `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`
- files under documented Docker context/config directories

Skip generated files only when docs identify them as generated and outside manual-edit scope.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-docker-style/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `DOCKER.md`, `CODING_STYLE.md`, and `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map Docker context
For each changed file:
- identify the Docker context root from config/docs or nearest repo root
- associate Dockerfiles with adjacent project files where possible
- associate Compose files with their referenced service build contexts

Do not hardcode project-specific service names, ports, or health paths. Use docs and config first.

### Step 4 - Run configured tools
Run `dockerStyleCommand` when configured.

If a Compose file changed, run `dockerComposeCommand` from the documented working directory. Default:

```bash
docker compose config
```

Do not build images or restart services unless the parent workflow explicitly asks for that.

### Step 5 - Inspect Docker conventions
Inspect changed Dockerfiles, `.dockerignore`, and Compose files against documented rules plus marketplace defaults.

When a Dockerfile is clearly not a production application image, only apply relevant rules and explain skipped production-only checks.

### Step 6 - Report result
If violations exist:

```text
Docker convention violations:
  1. <file>:<line> - <rule broken> (source: <doc-or-skill>:<section>)
```

If clean:

```text
No Docker convention violations found.
```

## Rules
- Docker-specific .NET image rules belong here because they govern container build/runtime behavior.
- Pure C# code style, project architecture, and .NET test conventions belong in the .NET skills.
- Never hardcode project-specific service names, paths, ports, or secret names.
- Prefer documented project rules over marketplace defaults.
- Do not fix files unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
