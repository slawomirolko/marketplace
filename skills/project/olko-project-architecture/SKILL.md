---
name: olko-project-architecture
description: "Check whole-monorepo architecture compliance for a project with marketplace defaults. Reads project docs and adapters, discovers the top-level layout (apps/*, services/*, platform/*, ai/*, docs/*, infrastructure/*, tests/*), verifies the apps-vs-services-vs-platform separation, DDD module layering (api/application/domain/infrastructure/contracts) and dependency direction, cross-module/cross-service communication through platform contracts and messaging, shared-code ownership, independent buildability, and delegates the ai/ subtree check to olko-ai-architecture. Use when validating overall project architecture, during plan review, when onboarding a new app/service/module, or standalone to verify the repo layout and layering are not drifting."
---

# Olko Project Architecture

## What I do
- Discover the project's top-level layout and buildable surfaces (`apps/*`, `services/*`, `platform/*`, `ai/*`, `docs/*`, `infrastructure/*`, `tests/*`, plus `tools/`, `playground/`, `examples/`).
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-project-architecture/project.md`, scoped `AGENTS.md`, and `ARCHITECTURE.md`.
- Verify the top-level separation, DDD module layering and dependency direction, and cross-surface communication conventions.
- Delegate the `ai/` subtree check to `olko-ai-architecture`.
- Report violations with file, line, broken rule, and rule source.

## Optional dependencies (uses)

This skill may delegate the `ai/` subtree check when declared in the project adapter (`.agents/skills/olko-project-architecture/project.md`):

```yaml
uses:
  - olko-ai-architecture
```

If `olko-ai-architecture` is not declared, run the built-in `ai/` checks below.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `projectArchitectureCommand` | — | Command to run whole-project architecture checks. |
| `appsDir` | `apps/` | Runnable applications root (web/api/mobile, etc.). |
| `servicesDir` | `services/` | Standalone deployable services root. |
| `platformDir` | `platform/` | Shared cross-cutting platform root. |
| `aiRoot` | `ai/` | AI context tree root (delegated to olko-ai-architecture). |
| `docsDir` | `docs/` | Documentation root. |
| `infrastructureDir` | `infrastructure/` | Infrastructure definitions root. |
| `testsDir` | `tests/` | Cross-cutting tests root. |
| `moduleLayers` | `api, application, domain, infrastructure, contracts` | DDD layers expected inside a module. |
| `readArchitectureDocs` | `true` | Whether to read architecture docs. |

## Default project architecture rules

Apply these defaults unless config, adapter, or project docs override them.

### Top-level separation
- `apps/` holds runnable applications (e.g. api, web, mobile). Each entry is an independently buildable unit.
- `services/` holds standalone deployable services. A service may use a different stack from the apps; keep one deployable per top-level entry.
- `platform/` holds shared, cross-cutting platform assets consumed by apps and services: contracts (DTOs/events/OpenAPI/proto), workflows (cross-module/cross-service processes), messaging (queues/events/topics), auth, and shared utilities.
- `docs/`, `infrastructure/`, `tests/`, `tools/`, `playground/`, `examples/` are supporting tops; do not put application/service business logic in them.
- Do not mix concerns across tops: runnables in `apps/`, deployables in `services/`, shared contracts in `platform/`.

### DDD module layering
- Inside a modular app (e.g. `apps/api/modules/<module>/`), keep one directory per layer: `api`, `application`, `domain`, `infrastructure`, `contracts`.
- `domain` and `contracts` have no outbound dependencies on other layers. They depend only on themselves and on `platform/` shared primitives.
- `application` depends on `domain` and `contracts`. It orchestrates use cases but does not know transport details.
- `api` (transport/HTTP/gRPC) and `infrastructure` (persistence, external clients) depend on `application` and `domain`; they implement interfaces declared in `application` or `domain`.
- `contracts` is the single source for the module's DTOs/events consumed by other modules or services.
- Do not put infrastructure concerns (DB, HTTP, third-party clients) in `domain`. Do not put domain/business logic in `api` transport or CLI adapters.
- Do not skip layers — `api` must not call `infrastructure` directly bypassing `application` unless the project explicitly adopts a thinner model and docs say so.

### Dependency direction
- `apps/*` and `services/*` depend on `platform/*`. `platform/*` never depends on a specific app or service.
- Modules within an app do not depend on each other directly except through `contracts` or a shared module. Cross-module communication goes through `platform/contracts` + `platform/messaging` (or the documented workflow path), not through direct internal imports.
- A service must not depend on another service's internals; services integrate through `platform/contracts` and `platform/messaging`.
- Do not introduce cycles between modules, services, or layers.

### Cross-surface communication
- Cross-module and cross-service communication flows through `platform/contracts` (DTOs/events) and `platform/messaging` (queues/topics), coordinated by `platform/workflows` for multi-step processes.
- Do not duplicate contract definitions across surfaces; `platform/contracts` is the single source.
- Do not reimplement platform transport inside a module or service.

### Shared code and duplication
- Put genuinely shared code in `platform/shared` (cross-app/service) or the app's own `shared/` (app-wide). Do not duplicate shared logic across modules/services.
- Do not copy-paste a contract or utility into a second surface; reference the single source.

### Independent buildability
- Each app and service is independently buildable and testable from its own root using the documented tooling.
- Do not couple two apps/services such that one cannot build without the other's sources, except through published `platform/contracts`.

### The ai/ subtree
- Keep AI context under `ai/` split into `context/`, `skills/`, `prompts/`, `templates/`.
- `ai/context/` holds `global.md` (cross-cutting) plus one file per major surface; `ai/skills/` holds one skill directory per surface plus cross-cutting design skills.
- Keep the `ai/` tree in sync with the codebase surfaces (one context file + skill per real app/service surface; no stale artifacts for removed surfaces).
- Delegate the detailed `ai/` checks to `olko-ai-architecture` when declared in `uses`.

### Tests placement
- Cross-cutting integration, contract, and e2e tests live under `tests/` (integration, contract, e2e).
- Module/app-local unit tests live with the module or app, not under the top-level `tests/`.

### Docs placement
- Keep architecture records, ADRs, and comparisons under `docs/` (architecture, adr, comparisons, business).
- Do not put architecture rules in ad-hoc README files scattered across the tree; keep a discoverable `docs/architecture` home.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Discover the top-level layout by convention (`apps/`, `services/`, `platform/`, `ai/`, `docs/`, `infrastructure/`, `tests/`) unless config/docs override the directory names.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-project-architecture/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `ARCHITECTURE.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Inspect top-level separation
Check the documented top-level layout plus marketplace defaults. Common checks:
- runnable code outside `apps/`/`services/`
- shared platform code living inside an app or service
- business logic inside `docs/`, `infrastructure/`, or `tools/`
- a deployable placed under `apps/` instead of `services/` (or vice versa)

### Step 4 - Inspect DDD layering and dependency direction
For each changed module, check:
- missing expected layers (`api`/`application`/`domain`/`infrastructure`/`contracts`)
- `domain`/`contracts` importing `infrastructure`/`api`
- `api` calling `infrastructure` directly, bypassing `application`
- infrastructure concerns inside `domain`
- a module importing another module's internals instead of its `contracts`
- a service depending on another service's internals
- `platform/*` depending on a specific app/service
- cycles between modules, services, or layers

Use import/dependency inspection where practical. Avoid brittle text-only checks.

### Step 5 - Inspect cross-surface communication and shared code
- cross-module/cross-service calls bypassing `platform/contracts` / `platform/messaging`
- duplicated contract or utility definitions across surfaces
- a module reimplementing platform transport

### Step 6 - Delegate the ai/ subtree
If `olko-ai-architecture` is declared in `uses`, delegate all `ai/` checks to it and follow its result. Otherwise run the built-in `ai/` checks above against the `ai/` subtree.

### Step 7 - Run architecture command when configured
If `projectArchitectureCommand` exists, run it from the repo root or documented working directory.

If no command exists, do not invent one. Continue with structure-based inspection.

### Step 8 - Report result
If violations exist:

```text
Project architecture violations:
  1. <file-or-dir>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If command checks fail, include the failing command and the smallest useful error snippet.

If clean:

```text
No project architecture violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard monorepo/DDD conventions per project.
- Never hardcode project-specific app, service, or module names — discover them by convention or from docs.
- Prefer documented project rules over generic architecture opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
