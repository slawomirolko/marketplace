---
name: olko-dotnet-style
description: "Check .NET/C# style compliance for changed C# projects with marketplace defaults. Maps .cs/.csproj files to source projects, reads project docs/adapters, runs dotnet format by default when no project command is configured, checks common C# style expectations that docs enable, and reports violations with rule sources. Use when validating .NET style, linting C# changes, before commit/test gates, or when olko-commit-style delegates .NET style checks."
---

# Olko Dotnet Style

## What I do
- Map changed `.cs` / `.csproj` files to their nearest `.csproj`.
- Read style rules from `.agents/skill-config.md`, `.agents/skills/olko-dotnet-style/project.md`, scoped `AGENTS.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Run a marketplace default style command when the project does not define one.
- Inspect changed files against documented style rules that tooling cannot enforce.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `dotnetStyleCommand` | `dotnet format <project>.csproj --verify-no-changes --no-restore` | Command to verify .NET style. |
| `dotnetStyleFixCommand` | `dotnet format <project>.csproj --no-restore` | Command to auto-fix .NET style. |
| `dotnetProjectRoot` | nearest `.csproj` | Override project root/project path. |
| `dotnetStyleGeneratedGlobs` | `**/bin/**`, `**/obj/**`, `**/*.g.cs`, `**/*.Designer.cs`, `**/Generated/**` | Files skipped unless docs say otherwise. |
| `readArchitectureDocs` | `true` | Whether architecture docs may add style constraints. |
| `readTestingDocs` | `true` | Whether test docs may add test style constraints. |

## Marketplace defaults

Use these defaults only when config, adapter, or project docs do not override them:

```yaml
dotnetStyleCommand: "dotnet format <project>.csproj --verify-no-changes --no-restore"
dotnetStyleFixCommand: "dotnet format <project>.csproj --no-restore"
dotnetStyleGeneratedGlobs:
  - "**/bin/**"
  - "**/obj/**"
  - "**/*.g.cs"
  - "**/*.Designer.cs"
  - "**/Generated/**"
readArchitectureDocs: true
readTestingDocs: true
```

These are reusable marketplace defaults. Project-specific naming rules, layer names, and custom commands belong in `.agents/skill-config.md`, `.agents/skills/olko-dotnet-style/project.md`, or `AGENTS.md`.

## Default .NET style rules

Apply these defaults unless config, adapter, or project docs override them.

### Documentation and method shape
- Every method must have XML doc comments with a one-line `<summary>` describing what it does and a one-line `<remark>` explaining why it exists.
- Do not leave public, internal, private, or local-function-like methods undocumented when they are part of checked source.
- Keep methods at or below 30 lines unless the local docs allow a specific exception.
- Method names should represent one responsibility.
- Do not create method names containing `And`, such as `ValidateAndSave` or `FetchAndStore`.

### Naming and file organization
- Use file-scoped namespaces.
- Namespace must match the file location relative to the project root, for example `ProjectRoot/Weather/WeatherService.cs` -> `ProjectRoot.Weather`.
- Keep one public type per file unless a tiny helper type is tightly bound to the main type.
- Keep related types together in the same feature namespace and folder tree.
- For every `record`, declare data with explicit public properties using `{ get; init; }`.
- Use opening and closing braces for all control flow statements, including single-line `if`, `else`, `for`, `foreach`, `while`, `using`, `lock`, and `fixed`.
- `CancellationToken` parameters must use the full name `cancellationToken` and default to `default`, for example `CancellationToken cancellationToken = default`.

### Modern C#
- Enable nullable reference types in all projects with `<Nullable>enable</Nullable>`.
- Do not disable nullable warnings without a documented justification.
- Use `required` for non-nullable properties in classes and records.
- Use init-only properties for immutable data.
- Use collection expressions and spread syntax where they improve clarity.
- Use raw string literals for multi-line strings and JSON.
- Use `ArgumentNullException.ThrowIfNull(value)` instead of manual null checks.
- Use `ArgumentOutOfRangeException.ThrowIfNegativeOrZero(value)` for matching parameter validation.
- Use pattern matching with records for discriminated unions and control flow.
- Do not use the null-forgiving operator (`!`) unless the impossibility of null is clear and local.
- Prefer `global using` directives in a dedicated `GlobalUsings.cs` file.
- Use `FrozenDictionary` and `FrozenSet` for static readonly lookup data on .NET 8+ when lookup cost matters.
- Do not use primary constructors for dependency injection; prefer explicit constructors for injected services.

### Performance style
- Use async/await for I/O and always accept and forward `CancellationToken`.
- Do not use blocking calls such as `.Result` or `.Wait()` in async code.
- Use `ValueTask<T>` only when a method may complete synchronously and the benefit is clear.
- Use `ArrayPool<T>` for temporary buffers when repeated allocation matters.
- Pre-size collections when the count is known.
- Use `Span<T>` / `ReadOnlySpan<T>` for hot-path zero-allocation string and array processing.
- Use `stackalloc` only for small fixed-size buffers.
- Materialize LINQ queries once when enumerating multiple times.
- Do not enumerate an `IEnumerable<>` multiple times.
- Use `Any()` instead of `Count() > 0` for existence checks.
- Use `Select` projections early in LINQ chains to reduce transferred data.
- Prefer `StringBuilder` over string concatenation in loops.

### EF Core style
- Use `HasPrecision(18, 2)` for decimal properties unless domain docs require another precision.
- Use `HasMaxLength(N)` for string properties with known length limits.
- Use `IsRequired()` explicitly on non-nullable navigation and scalar properties.
- Use `AsNoTracking()` for all read-only EF Core queries.
- Use `AsSplitQuery()` when eager-loading multiple collections.
- Use `.Select()` projection instead of loading full entity graphs when only a subset of columns is needed.
- Use `ExecuteUpdateAsync()` and `ExecuteDeleteAsync()` for bulk operations on .NET 7+ when appropriate.
- Use compiled queries for frequently executed hot-path queries.

### Auto-styling
- Use `dotnet format` to apply repo-wide formatting and style fixes.
- Prefer `dotnet format` when code should be restyled automatically.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.cs` and `.csproj` files. Skip generated files matching `dotnetStyleGeneratedGlobs` unless docs explicitly require checking them.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-dotnet-style/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `CODING_STYLE.md`, and `TESTING.md` walking up from each changed file
- nearest `ARCHITECTURE.md` when `readArchitectureDocs: true`
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map projects
For every changed source file:
- find the nearest `.csproj`, unless `dotnetProjectRoot` overrides it
- group files by project
- classify source vs test project by project name and docs

Do not invent project-specific layer names.

### Step 4 - Run style command
Run `dotnetStyleCommand` from the repo root or documented working directory.

Replace `<project>.csproj` with the discovered project path. If a solution-level command is configured in docs/config, use that instead.

Do not run restore unless docs/config require it.

### Step 5 - Inspect documented style rules
Check only rules found in docs/adapters/config. Common rule types to look for when documented:
- nullable/reference-type handling
- async naming and cancellation token conventions
- exception/logging conventions
- dependency injection registration style
- test naming, fixture, builder, and assertion conventions
- generated-code edit restrictions
- namespace/file layout conventions

Do not enforce personal C# opinions unless the project docs say so.

### Step 6 - Handle violations
If violations exist and `dotnetStyleFixCommand` is configured or documented, ask before running it unless the parent workflow already authorized auto-fix.

If reporting:

```text
.NET style violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No .NET style violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard .NET style commands per project.
- Never hardcode project-specific paths, layer names, or business rules.
- Prefer documented project rules over generic .NET opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
