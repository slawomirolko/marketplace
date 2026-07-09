---
name: olko-kotlin-style
description: "Check Kotlin/Android style compliance for changed Kotlin files with marketplace defaults. Reads project docs and adapters, maps .kt/.kts files to Gradle module roots, runs documented format/lint commands such as ktlint/detekt when configured, checks common Kotlin style expectations that docs enable (naming, formatting, imports, classes, value classes, extension/scope functions, collection ops, nullability, coroutines/Flow, Compose, networking), and reports violations with rule sources. Use when validating Kotlin style, linting Kotlin changes, before commit/test gates, or when olko-commit-style delegates Kotlin style checks."
---

# Olko Kotlin Style

## What I do
- Map changed `.kt` / `.kts` files to their nearest Gradle module root.
- Read style rules from `.agents/skill-config.md`, `.agents/skills/olko-kotlin-style/project.md`, scoped `AGENTS.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Run the documented Kotlin style command.
- Inspect changed files against documented style rules that tools cannot enforce.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `kotlinStyleCommand` | — | Command to verify Kotlin style. |
| `kotlinStyleFixCommand` | — | Command to auto-fix Kotlin style. |
| `kotlinProjectRoot` | nearest `gradlew` / `settings.gradle.kts` dir | Override Gradle project root. |
| `kotlinStyleGeneratedGlobs` | `**/build/**`, generated protobuf/Route dirs | Files skipped unless docs say otherwise. |
| `readArchitectureDocs` | `true` | Whether architecture docs may add style constraints. |
| `readTestingDocs` | `true` | Whether test docs may add test style constraints. |

## Marketplace defaults

Use these defaults only when config, adapter, or project docs do not override them:

```yaml
kotlinStyleGeneratedGlobs:
  - "**/build/**"
readArchitectureDocs: true
readTestingDocs: true
```

These are reusable marketplace defaults. Project-specific naming rules, layer names, and custom commands belong in `.agents/skill-config.md`, `.agents/skills/olko-kotlin-style/project.md`, or `AGENTS.md`.

## Default Kotlin style rules

Apply these defaults unless config, adapter, or project docs override them.

### Language and target
- Write all `.kt` files in Kotlin, not Java.
- Target the JVM bytecode version the docs prescribe (typically JVM 17).

### Naming
- Kotlin file names use PascalCase matching the main type (e.g. `HomeViewModel.kt`).
- Directory names use lowercase with underscores if multi-word.
- Class/object names: PascalCase. Function/property names: camelCase.
- Constants (top-level or companion-object `val`): UPPER_SNAKE_CASE.
- Android resource IDs: snake_case in XML, camelCase in Kotlin references.

### Formatting
- 4-space indentation (no tabs).
- 120-character line limit.
- Trailing commas in multi-line lists.
- Prefer single-expression functions when the body fits one line.

### Imports
- No wildcard imports.
- Group imports: Kotlin/Android first, then third-party, then project imports, with blank lines between groups.

### Classes and types
- One public type per file.
- Use `data class` for models/DTOs, sealed class/interface for UI state and result types, `object` for singletons.
- Prefer composition over inheritance.
- Use explicit constructors for classes with dependencies; follow the project's documented DI strategy and do not mix DI approaches.
- Use sealed class/interface for restricted type hierarchies:

```kotlin
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Failure(val error: ErrorCode) : Result<Nothing>()
}
```

### Value classes
- Use `@JvmInline value class` for type-safe wrappers (IDs, amounts).
- Do not wrap nullable types in value classes without reason.

```kotlin
@JvmInline
value class SagaId(val value: Long)
```

### Extension functions
- Use extension functions for converting between layers (Entity -> DTO, model -> UI state) and for adding domain-specific utility to standard types.
- Do not access private/internal state of the receiver.
- Do not use extension functions to modify mutable shared state.

```kotlin
fun SagaResult.toUiState() = SagaUiState(id = id, status = status, name = name)
```

### Scope functions
| Function | Return | Use case |
|---|---|---|
| `let` | Lambda result | Null-check execution, mapping |
| `run` | Lambda result | Object config + compute result |
| `apply` | Object itself | Object initialization / builder |
| `also` | Object itself | Side effects (logging, validation) |
- Maximum 2 scope functions chained — beyond that, extract to local variables.
- Never nest scope functions more than 1 level deep.
- Do not use `let` on non-null values without reason.

### Collection operations
- Use `map`, `filter`, `associateBy`, `groupBy`, `sumOf` from the Kotlin stdlib.
- Use `firstOrNull`, `mapNotNull` for null-safe collection access.
- Use `asSequence()` for chains of 3+ operations on large collections.
- Use `buildList` / `buildMap` for constructing collections conditionally.
- Avoid `flatMap` inside loops — restructure.

### Nullability
- Avoid `!!` (non-null assertion) in production code.
- Use `?.`, `?:`, `let`, `also` for safe null handling.
- `lateinit` allowed only where docs permit (e.g. ViewBinding/Compose-backed properties); do not use it as a general null workaround.

### Coroutines and Flow
- Use `viewModelScope` for `ViewModel` coroutines.
- `Dispatchers.IO` for network/disk; `Dispatchers.Main` for UI updates.
- Do not use `GlobalScope`.
- Mark a function `suspend` only if it calls other suspend functions.
- Keep suspend functions main-safe — dispatcher switching is the callee's responsibility.
- `supervisorScope` for independent children; `coroutineScope` for all-or-nothing parallelism.
- Never wrap blocking I/O in a `suspend` function without `withContext(Dispatchers.IO)`.

```kotlin
suspend fun fetchDashboard(id: Long): Dashboard = coroutineScope {
    val profile = async { repository.getProfile(id) }
    val sagas = async { repository.getSagas(id) }
    Dashboard(profile.await(), sagas.await())
}
```

- `StateFlow` for UI state (current value, skips duplicates). `SharedFlow` for one-shot events/commands (no initial value).
- `flowOn(Dispatchers.IO)` to set the upstream dispatcher. `catch { }` for upstream errors. `distinctUntilChanged()` to skip consecutive duplicates.
- Do not collect cold flows (`flow { }`) directly for UI; expose `StateFlow` / `SharedFlow`.

### Compose
- `@Composable` functions start with an uppercase letter.
- Each composable does one thing — extract sub-composables for reuse.
- State hoisting: state flows down, events flow up.
- Use `@Preview` on stateless composables where useful.

### Networking style
- Retrofit interface methods return `Response<T>` or `Result<T>` — never raw `T` without error handling.
- Keep one networking singleton (e.g. an `ApiClient` `object`); do not construct OkHttp/Retrofit instances per call.
- Do not catch network errors silently; propagate to the `ViewModel` for a UI error state.

### Functions and types
- Keep functions short and focused on one responsibility.
- Prefer explicit types on public APIs where they aid readability; avoid redundant types where inference is obvious.
- Keep log output structured and consistent with the surrounding codebase.

### Generated code
- Do not edit generated code (e.g. generated protobuf/Route sources, `build/` outputs) by hand.
- Keep generated sources excluded from manual formatting and lint cleanup.
- Regenerate through the documented generator task, not by hand.

### File creation
- Use `java.nio.file.Path` (or `kotlin.io.path` extensions) rather than legacy `java.io.File` where practical.
- Always close/flush streams (use `.use { }` for `Closeable` resources).
- Always specify text encoding explicitly (e.g. `Charsets.UTF_8`).
- Create parent directories before writing (`File(...).parentFile?.mkdirs()` / `Files.createDirectories`).
- Handle `IOException` gracefully — do not let a failed write silently corrupt state.

### When to create a new class
- Encapsulate state and behavior together.
- Multiple independent instances are needed.
- Customizing via inheritance or composition.
- Lifecycle management is required (setup/cleanup).

### When to split to a new file
- File exceeds ~400-500 lines.
- Different abstraction layers (I/O vs business logic vs presentation).
- Public vs private separation.
- One public class or cohesive function group per file.

### Single responsibility
- Class: one reason to change.
- Function: do one thing at one abstraction level.
- Module: one domain concept per file.
- Keep parsing, storage, business logic, and presentation separate.

### Silent failures — zero tolerance
- Never return `null`, empty collections, or silently skip processing when a required file/resource/config is missing.
- Never swallow exceptions and return an empty/default result without logging or propagating.
- Never silently ignore mismatched key formats or missing config values; fail fast with a clear error.
- If a file is expected but missing, surface a clear error including the path.
- If a config key does not resolve, surface a clear error naming the expected key.

### Comments
- Do not write comments. Code should be self-documenting through clear naming.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.kt` / `.kts` files. Skip generated files only when docs say they are not manually edited.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-kotlin-style/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map Gradle roots
For every changed file:
- find nearest `gradlew` / `settings.gradle.kts` / `build.gradle.kts`, unless `kotlinProjectRoot` overrides it
- group files by Gradle module root
- identify the working directory from config, adapter, or docs

### Step 4 - Run style command
Run `kotlinStyleCommand` when configured.

If no config command exists, use the command documented in `AGENTS.md` / `CODING_STYLE.md`.

If docs name a tool but not a command, infer the narrow verify command only for standard project-local tools already configured in `build.gradle.kts` / the version catalog:
- `./gradlew ktlintCheck`
- `./gradlew detekt`

Do not install tools, add plugins, or change config.

### Step 5 - Inspect documented style rules
Check rules found in docs/adapters/config plus marketplace defaults when docs do not override them. Common rule types to look for:
- import ordering beyond formatter config
- naming conventions (files, classes, functions, constants, resource IDs)
- formatting (indent, line length, trailing commas)
- value class / sealed class / extension / scope function usage
- collection operation and nullability rules (`!!`, `lateinit`)
- coroutine/Flow conventions (`GlobalScope`, dispatcher usage, main-safety)
- Compose conventions (no logic in composables, state hoisting)
- networking style (singleton client, response wrappers)
- silent failures and fail-fast behavior for missing resources/config
- generated-code edit restrictions
- comments (code should be self-documenting)

### Step 6 - Handle violations
If violations exist and `kotlinStyleFixCommand` is configured or documented, ask before running it unless the parent workflow already authorized auto-fix.

If reporting:

```text
Kotlin style violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No Kotlin style violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard Kotlin/Android style conventions per project.
- Never hardcode project-specific commands, paths, or style rules.
- Prefer documented project rules over generic Kotlin/Android opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
