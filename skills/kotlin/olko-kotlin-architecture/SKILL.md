---
name: olko-kotlin-architecture
description: "Check Kotlin/Android architecture compliance for changed Kotlin projects with marketplace defaults. Reads project docs and adapters, maps changed .kt/.kts files to Gradle module roots, verifies source-set layout, module boundaries, dependency direction, MVVM/ViewModel-StateFlow separation, networking singleton ownership, Gradle dependency configuration, build/dependency management, security boundaries, external-service client configuration, and reports violations with rule sources. Use when validating Kotlin/Android architecture, before commit/test gates, during plan review, or when olko-commit-style/olko-test/olko-plan-editor delegates Kotlin architecture checks."
---

# Olko Kotlin Architecture

## What I do
- Map changed `.kt` / `.kts` files to their nearest Gradle module root.
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-kotlin-architecture/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Inspect imports, module/source-set boundaries, networking ownership, and dependency direction against documented rules.
- Run configured architecture/import checks when present.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `kotlinArchitectureCommand` | — | Command to run Kotlin/Android architecture checks. |
| `kotlinProjectRoot` | nearest `gradlew` / `settings.gradle.kts` dir | Override Gradle project root. |
| `kotlinSourceRoot` | `app/src/main/java` (or `.../kotlin`) | Source root relative to the Gradle module root. |
| `kotlinTestSourceRoot` | `app/src/test` | JVM unit-test source set. |
| `kotlinInstrumentationSourceRoot` | `app/src/androidTest` | Instrumentation source set. |
| `kotlinGeneratedCodeDirs` | `build/`, generated protobuf/Route dirs | Directories excluded from manual-edit and boundary checks. |
| `readArchitectureDocs` | `true` | Whether to read architecture docs. |

## Default Kotlin architecture rules

Apply these defaults unless config, adapter, or project docs override them.

### Layout
- Keep Kotlin implementation code under a documented source root (e.g. `app/src/main/java/<package>/` or `app/src/main/kotlin/<package>/`).
- Keep unit tests under `app/src/test/` and instrumentation tests under `app/src/androidTest/`; mirror the main package structure in both.
- Keep generated code (generated protobuf, generated Compose previews artifacts, `build/` outputs) under generated directories; do not hand-edit it.
- Keep a single-activity Compose host; add new screens as `@Composable` functions in their own files under `ui/screens/`.
- Do not duplicate shared contract definitions across modules; keep one source of truth per type.

### Architecture pattern
- Follow MVVM: a `ViewModel` exposes immutable UI state (typically `StateFlow<UiState>`); Compose screens observe it.
- Keep business logic in `ViewModel`s (or a documented repository layer when the project adopts one); do not put business logic in composables.
- Do not make direct API/network calls from composables — route them through a `ViewModel` or repository.
- Keep UI state as sealed classes/interfaces for restricted states (e.g. `Loading` / `Success` / `Error`).
- Hoist state: state flows down, events flow up. Stateless composables for previews where useful.

### Networking and external-service client configuration
- Keep one networking singleton (e.g. an `ApiClient` `object`) that constructs the OkHttp + Retrofit instance once, lazily.
- Keep authentication centralized in a single interceptor (e.g. `AuthInterceptor`) attached at the client setup point; do not scatter auth headers across call sites.
- Retrofit interface methods should return `Response<T>` or `Result<T>` — never a raw `T` without error handling.
- Do not catch network errors silently; propagate them to the `ViewModel` so the UI can render an error state.
- Keep external-service client configuration (base URLs, headers, auth, timeouts) centralized in a settings/config object that reads documented sources; do not hardcode connection details in business logic.
- Keep a passing instrumentation test that exercises the real external-service path as confirmation the full auth/connection chain works. Do not modify external-service infrastructure (URLs, endpoints, auth, headers) when that test passes; only investigate when it fails.

### Gradle, build, and dependency management
- Use Gradle Kotlin DSL (`.kts`) and the committed Gradle wrapper (`./gradlew`); do not rely on system-installed Gradle.
- Keep dependency versions in a version catalog (`gradle/libs.versions.toml`) for multi-module projects; do not scatter hardcoded version strings across build files.
- Default to `implementation`; use `api` only when a dependency type appears in public signatures; `testImplementation` / `androidTestImplementation` / `debugImplementation` for the matching source sets; `runtimeOnly` / `compileOnly` where appropriate.
- Keep build optimization flags in `gradle.properties` (parallel, caching, daemon; daemon disabled in short-lived CI environments).
- Keep `local.properties` (e.g. `sdk.dir`) uncommitted and machine-local.

### Security boundaries
- Map entities to dedicated response DTOs at the API boundary; never return or surface internal entities directly.
- Validate input at the boundary; reject bad input early. Do not trust client-side validation alone.
- Store secrets in environment variables or the Android keystore; never commit secrets or provide default values for secret config keys.
- Use HTTPS in production; restrict cleartext traffic to local dev only.

### Observability and logging
- Route logging through a documented logger or a thin wrapper; do not scatter raw `println` or ad-hoc log calls in business logic.
- Never log sensitive data (tokens, credentials, PII).
- Give each long-running component a stable identity for logs/traces when the project adopts tracing.

### Module organization
- Keep API/transport code in a `data/api` (or documented data) layer.
- Keep authentication code in a dedicated `auth` (or documented) layer.
- Keep screen composables under `ui/screens`, navigation under `ui/navigation`, themes under `ui/theme`, and view models under `ui/viewmodel` (or the documented equivalents).
- Consume API inputs from the system boundary; do not reimplement boundary transport inside `ViewModel` business logic.

### Maintenance
- Regenerate generated code through the documented generator task, not by hand.
- Keep build markdown docs out of automated generation unless explicitly requested.
- See the project's architecture docs for connection and endpoint setup.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.kt` / `.kts` files. Skip generated files when docs identify them as generated and outside manual-edit scope. Skip `build/` outputs.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-kotlin-architecture/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map Gradle roots
For every changed file:
- find nearest `gradlew` / `settings.gradle.kts` / `build.gradle.kts`, unless `kotlinProjectRoot` overrides it
- identify source sets (`main`, `test`, `androidTest`) from the module layout or docs
- identify generated-code directories only from docs/config or established repo layout

### Step 4 - Inspect architecture
Check documented rules plus marketplace defaults when docs do not override them. Common rule types to look for:
- import direction between layers/packages
- feature/module boundary crossings
- data/domain/ui separation and MVVM boundaries
- networking singleton ownership and scattered auth/network calls
- no business logic or direct API calls in composables
- generated file ownership
- dependency configuration misuse (`api` vs `implementation`, source-set leaks)
- version catalog vs scattered hardcoded versions
- security boundaries (entity vs DTO, hardcoded secrets, cleartext in release)
- external-service client config centralization and contract/instrumentation coverage
- module organization (api/auth/screens/viewmodel placement)

Use Kotlin import/package inspection where practical. Avoid brittle text-only checks.

### Step 5 - Run architecture command when configured
If `kotlinArchitectureCommand` exists, run it from the Gradle project root or documented working directory.

If no command exists, do not invent one. Continue with document-based inspection.

### Step 6 - Report result
If violations exist:

```text
Kotlin architecture violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If command checks fail, include the failing command and the smallest useful error snippet.

If clean:

```text
No Kotlin architecture violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard Kotlin/Android architecture conventions per project.
- Never hardcode project-specific package names, commands, or paths.
- Prefer documented project rules over generic Kotlin/Android opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
