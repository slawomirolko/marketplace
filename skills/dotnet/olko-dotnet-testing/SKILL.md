---
name: olko-dotnet-testing
description: "Check .NET test conventions for changed C# projects with marketplace defaults. Reads project docs/adapters, maps source changes to test projects, verifies InternalsVisibleTo usage, test visibility boundaries, smart enum coverage, saga JSON/ErrorOr assertion conventions, performance validation expectations, and reports violations with rule sources. Use when validating .NET tests, before commit/test gates, or when olko-test delegates .NET test-convention checks."
---

# Olko Dotnet Testing

## What I do
- Map changed `.cs` / `.csproj` files to related .NET test projects.
- Read test rules from `.agents/skill-config.md`, `.agents/skills/olko-dotnet-testing/project.md`, scoped `AGENTS.md`, `TESTING.md`, `Tests_convention.md`, and `CODING_STYLE.md`.
- Check marketplace default .NET test conventions unless project docs override them.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `dotnetTestCommand` | `dotnet test <test-project>.csproj --no-restore` | Command to run .NET tests. |
| `dotnetTestProjectPatterns` | `*.Tests.csproj`, `*.Tests.Integration.csproj`, `*.Integration.Tests.csproj` | Test project discovery globs. |
| `readTestingDocs` | `true` | Whether to read test docs. |
| `dotnetTestingDocs` | `TESTING.md`, `Tests_convention.md` | Additional test convention docs to read when present. |

## Default .NET test rules

Apply these defaults unless config, adapter, or project docs override them.

### Visibility and InternalsVisibleTo
- If `InternalsVisibleTo` is needed, declare it only in the `.csproj` file.
- Grant internals only to the specific test project that requires access.
- Do not expose internals to non-test projects.
- Do not declare `[assembly: InternalsVisibleTo(...)]` in `.cs` files.

### Test coverage conventions
- Add one unit test per smart enum that reads `All` and verifies every defined value is present.
- For performance-sensitive code, use BenchmarkDotNet with `[MemoryDiagnoser]` when the docs require performance validation.
- If a file/resource/config is required by the code path, tests should verify fail-fast behavior rather than silent defaults.
- If a key format convention is required, tests should fail when the mapping is missing.
- Enforce reflection bans from test docs when present.
- Enforce timeout conventions from test docs when present.
- Enforce test-double conventions from test docs when present.
- Prefer changing, parameterizing, or merging existing tests when Arrange/setup and execution path match.
- Do not merge tests whose Arrange only looks similar but verifies a different workflow.

### Saga and serialization tests
- Saga-focused tests should use `ILogger<TSaga>` so log categories stay aligned with the saga type.
- JSON tests around workflow messages should assert the explicit `ErrorOr<T>` wrapper shape instead of flattening away `value` or `errors`.
- Timeout tests should verify timeout values come from configuration, not hardcoded saga code.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep `.cs` and `.csproj` files. Group source and test files by nearest `.csproj`.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-dotnet-testing/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `TESTING.md`, `Tests_convention.md`, and `CODING_STYLE.md` walking up from each changed file
- any additional docs listed by `dotnetTestingDocs`
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Inspect test conventions
Check only changed files plus directly related project files. Common checks:
- invalid `InternalsVisibleTo` location or target
- missing smart enum coverage when a smart enum changes
- tests that assert flattened `ErrorOr<T>` JSON where wrapper shape is required
- timeout tests that cannot catch hardcoded timeout values
- missing fail-fast tests for required config/file/resource behavior when that behavior changes

### Step 4 - Run tests when configured
If `dotnetTestCommand` is configured or documented, run it for related test projects after convention checks pass.

Replace `<test-project>.csproj` with the discovered test project path. Do not run restore unless docs/config require it.

### Step 5 - Report result
If violations exist:

```text
.NET test convention violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No .NET test convention violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard .NET test conventions per project.
- Never hardcode project-specific paths, names, fixtures, or test frameworks.
- Prefer documented project rules over generic .NET opinions.
- Do not fix tests unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
