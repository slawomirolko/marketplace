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

### Test tiers
- Integration test projects such as `*.Tests.Integration` should cover main paths and application flows.
- Integration tests should use `WebApplicationFactory` with real implementations.
- Integration tests should wire real DbContext, real services, real message bus, or documented Testcontainers dependencies.
- Do not stub, fake, mock, or substitute dependencies inside integration test projects.
- Unit test projects such as `*.Tests` should cover edge cases, error paths, and boundary values.
- Unit tests should mock dependencies with NSubstitute.
- Unit tests must be fast, deterministic, and avoid I/O.
- Do not write integration tests for algorithm edge cases such as rounding, null inputs, or boundary checks; those belong in unit tests.
- Do not write a unit test for a flow already covered by an integration test.

### Coverage
- Treat 90% coverage as an aspirational guide, not a hard CI gate, unless project docs say otherwise.
- Use coverage to identify untested code paths, not as the only test quality signal.

### Visibility and InternalsVisibleTo
- If `InternalsVisibleTo` is needed, declare it only in the `.csproj` file.
- Grant internals only to the specific test project that requires access.
- Do not expose internals to non-test projects.
- Do not declare `[assembly: InternalsVisibleTo(...)]` in `.cs` files.

### Reflection ban
- Do not use `System.Reflection` to invoke private, protected, or internal members.
- Do not use `GetMethod(...).Invoke(...)`, `BindingFlags.NonPublic`, or reflection-based access patterns in normal tests.
- Do not make a method public just so tests can call it.
- Reflection is acceptable only in architecture test projects when enforcing design rules.
- Tests should exercise behavior through public interfaces or through `InternalsVisibleTo` declared in `.csproj`.
- Do not write tests that depend on non-public implementation details.

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

### Merge similar tests
- When tests exercise the same flow with the same setup and assertions but different inputs, consolidate them into parameterized tests.
- Use `[Theory]` with `[InlineData]`, `[MemberData]`, or `[ClassData]` when appropriate.
- Use shared test-data builders for preconfigured test objects.
- Use test base classes only when many test classes share the same fixture.
- Do not copy-paste the same test body with different inline values.

### Fixtures and builders
- Extract shared fixtures, builders, and test base classes into a shared test location.
- Use `IClassFixture<T>` for integration test shared state such as test database or `WebApplicationFactory`.
- Test data builders should be static factory methods on the model or dedicated builder classes.
- Do not duplicate the same `WebApplicationFactory` setup across multiple test classes.

### Database reset in integration tests
- Use Respawn v7+ to reset relational databases between integration test classes when a database is involved.
- Create one static `Respawner` on the shared container fixture so foreign-key discovery runs once per test run.
- Call `respawner.ResetAsync(connection)` at the start of each test class `InitializeAsync`.
- For PostgreSQL, configure `DbAdapter.Postgres` and ignore `__EFMigrationsHistory`.
- Do not write per-test `RemoveRange` / `SaveChanges` teardown blocks when Respawn can handle cleanup.
- Do not use transaction rollback strategies for integration test database isolation unless project docs require them.

### Test skip and silent pass policy
- Do not add logic that skips tests because of environment, browser, service availability, missing credentials, or platform limitations.
- Do not convert failing live or integration tests into skipped tests.
- Keep integration tests executable and let failures remain visible.
- Never use `if (condition) { return; }` or any early-return branch that bypasses assertions.
- Never silently return from a test when a precondition is not met; assert the precondition instead.

### Assertions
- Use Shouldly for all assertions unless project docs require another library.
- Do not use FluentAssertions when Shouldly is the project standard.
- Use tolerances for approximate numeric assertions, for example `result.ShouldBe(0.5, 0.001)`.

### Test doubles
- Unit tests should use NSubstitute for dependency mocks.
- Integration tests must not use NSubstitute.
- Integration tests must not use mocks, stubs, fakes, substitutes, or test-only internal implementations.
- Integration tests should use only real implementations wired through `WebApplicationFactory`, Testcontainers, or documented integration fixtures.

### Test naming and organization
- Name tests after one behavior using `MethodName_scenario_expectedResult`.
- Do not use `Or` or `And` in test names.
- Do not combine multiple outcomes in one test name, such as `returnsSuccessOrBlocked` or `createsAndPublishes`.
- If two outcomes must be covered, write two separate tests.
- Keep one test class per source class when practical.
- Test file names should mirror source file names, for example `FooServiceTests.cs` for `FooService.cs`.

### Saga and serialization tests
- Saga-focused tests should use `ILogger<TSaga>` so log categories stay aligned with the saga type.
- JSON tests around workflow messages should assert the explicit `ErrorOr<T>` wrapper shape instead of flattening away `value` or `errors`.
- Timeout tests should verify timeout values come from configuration, not hardcoded saga code.

### Timeouts
- Integration tests should use a maximum of 20 seconds per test unless project docs require a stricter limit.
- Prefer `CancellationTokenSource(TimeSpan.FromSeconds(20))` for integration test timeouts.
- Unit tests should execute under 2 seconds.

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
- reflection access to non-public members outside architecture tests
- missing smart enum coverage when a smart enum changes
- tests that assert flattened `ErrorOr<T>` JSON where wrapper shape is required
- timeout tests that cannot catch hardcoded timeout values
- missing fail-fast tests for required config/file/resource behavior when that behavior changes
- integration tests using mocks, stubs, fakes, substitutes, or NSubstitute
- unit tests doing I/O-heavy integration work
- skipped tests or silent early returns that bypass assertions
- FluentAssertions usage when Shouldly is required
- duplicate test bodies that should be parameterized
- integration database cleanup done through ad-hoc teardown instead of shared fixtures/Respawn

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
