---
name: olko-python-architecture
description: "Check Python architecture compliance for changed Python projects with marketplace defaults. Reads project docs and adapters, maps changed .py files to pyproject.toml roots, verifies package boundaries, dependency direction, generated-code ownership, source layout, runtime/dependency management, observability, and gRPC/external-integration boundaries, and reports violations with rule sources. Use when validating Python architecture, before commit/test gates, during plan review, or when olko-commit-style/olko-test/olko-plan-editor delegates Python architecture checks."
---

# Olko Python Architecture

## What I do
- Map changed `.py` files to their nearest Python project root.
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-python-architecture/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Inspect imports, package boundaries, generated files, and dependency direction against documented rules.
- Run configured architecture/import checks when present.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `pythonArchitectureCommand` | — | Command to run Python architecture checks. |
| `pythonProjectRoot` | nearest `pyproject.toml` | Override project root. |
| `pythonSourceRoot` | `src/` | Source root relative to the Python project root. |
| `pythonGeneratedCodeDirs` | generated gRPC stub dirs (e.g. `*_pb2*`) | Directories excluded from manual-edit and boundary checks. |
| `pythonProtosRoot` | `Protos/` (repo root) | Shared protobuf contracts root; do not duplicate under the Python tree. |
| `readArchitectureDocs` | `true` | Whether to read architecture docs. |

## Default Python architecture rules

Apply these defaults unless config, adapter, or project docs override them.

### Layout
- Keep all Python implementation code under a documented source root (e.g. `src/`).
- Keep generated gRPC client code under a dedicated generated directory.
- Keep shared protobuf contracts in the root `Protos/` directory (or the documented contracts root).
- Do not duplicate `.proto` files under the Python tree.
- Do not hand-edit generated `*_pb2.py` or `*_pb2_grpc.py` files.

### Runtime and dependency management
- Use the project's documented dependency manager and runner (e.g. `uv`) for dependency management and execution.
- Keep the Python virtual environment local to the Python project (e.g. `.venv`).
- Store runtime state in a documented state directory.
- Keep credentials in the root `.env` file only (repository root). Do not duplicate secrets into a Python-local `.env`.
- A Python-local `.env` is for non-secret dev overrides only (model names, stagger seconds, etc.).

### External-service client configuration
- Keep external-service client configuration (connection URLs, API keys, headers, auth) centralized in a settings module that loads the root `.env` and a Python-local override file.
- Keep the request shape consistent across entrypoints by applying the resolved settings through a single setup function.
- Keep a smoke test for the external-service connection path; it should perform a real call that confirms connection, model/endpoint selection, and API keys work.
- Keep a contract test that pins the external-service client request shape (base URL, headers, auth, request fields).
- A passing integration/smoke test confirms the full auth/connection chain works. Do not modify external-service infrastructure (connection URLs, model/endpoint names, API keys, environment variables, headers) when that test passes.
- Only investigate connection issues when the integration/smoke test fails.

### Observability
- Use OpenTelemetry for traces and logs when the project adopts it.
- Configure logging through a central logging module to send logs to the OTLP collector.
- Configure tracing through a central telemetry module to send traces to the OTLP collector.
- Use the project's span helper for custom trace spans.
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` to the documented collector endpoint when running locally.
- Give each service a stable OTEL service name and propagate trace context across process boundaries (e.g. W3C `traceparent`).

### Module organization
- Keep orchestration/workflow logic in a workflow module.
- Keep agent/component instructions in a dedicated instructions module.
- Keep tool logic and schemas in a tool registry module.
- Keep startup and trigger entrypoints in a main module.
- Keep runtime settings in a settings module.
- Consume gRPC and API inputs from the system boundary; do not reimplement boundary transport inside Python business logic.

### Maintenance
- Regenerate gRPC stubs through the documented generator script, not by hand.
- Keep Python markdown docs out of automated generation unless explicitly requested.
- See the shared gRPC docs for connection and endpoint setup.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.py` files. Skip generated files only when docs identify them as generated and outside manual-edit scope.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-python-architecture/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map Python roots
For every changed file:
- find nearest `pyproject.toml`, unless `pythonProjectRoot` overrides it
- identify source roots/packages from `pyproject.toml`, existing package layout, or docs
- identify test package and generated-code directories only from docs/config or established repo layout

### Step 4 - Inspect architecture
Check documented rules plus marketplace defaults when docs do not override them. Common rule types to look for:
- import direction between packages/layers
- feature/module boundary crossings
- application/domain/infrastructure separation
- sync/async boundary rules
- generated file ownership, especially gRPC stubs and client code
- no business logic in transport/CLI/API adapters
- dependency injection/config boundary rules
- source layout (source root, generated-code dir, shared proto contracts root)
- runtime/dependency management (venv location, runtime state, credentials only in root `.env`)
- external-service client config centralization and contract/smoke test presence
- observability (OpenTelemetry logging/tracing modules, OTLP endpoint, service names)
- module organization (workflow, instructions, tool registry, main, settings)

Use Python AST/import parsing where practical for imports. Avoid brittle text-only checks.

### Step 5 - Run architecture command when configured
If `pythonArchitectureCommand` exists, run it from the Python project root or documented working directory.

If no command exists, do not invent one. Continue with document-based inspection.

### Step 6 - Report result
If violations exist:

```text
Python architecture violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If command checks fail, include the failing command and the smallest useful error snippet.

If clean:

```text
No Python architecture violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard Python architecture conventions per project.
- Never hardcode project-specific package names, commands, or paths.
- Prefer documented project rules over generic Python opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
