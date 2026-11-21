# Olko Dotnet Testing Workflow

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
- missing `// Arrange` / `// Act` / `// Assert` markers, or assertions placed in Arrange/Act
- a local test-only record, class, or constant that mirrors a production wire type or contract value
- a per-test duplicated object graph where a shared builder exists
- test names that do not use `MethodUnderTest__scenario_expectedResult`
- mixed naming styles inside one touched test file
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
- Every branch, error path, and boundary value in changed production code needs an asserting test; report each uncovered one.

### Visibility and InternalsVisibleTo
- If `InternalsVisibleTo` is needed, declare it only in the `.csproj` file.
- Grant internals only to the specific test project that requires access.
- Do not expose internals to non-test projects.
- Do not declare `[assembly: InternalsVisibleTo(...)]` in `.cs` files.
- Prefer reading the real internal production type through `InternalsVisibleTo` over re-declaring an equivalent type in the test project.

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
- Give every builder method a named default for each parameter, so a test names only the field it varies.
- Builders read production-exposed values (smart enum `Name`s, contract constants) and call the production factory instead of re-typing literals or construction rules.
- Do not keep an inline static factory inside one test class when a second test class needs the same data; extract it to the shared test setup location.
- Do not duplicate the same `WebApplicationFactory` setup across multiple test classes.
- Put channel/client/marshaller plumbing that more than one test needs on the shared test base or a dedicated helper type, never in individual test classes.

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

### What not to test
- Do not write tests that only assert a mock received the exact arguments the test itself passed in; assert the observable outcome instead.
- Do not write tests that only assert a plain DTO or data-class property returns the value just set.

### Saga and serialization tests
- Saga-focused tests should use `ILogger<TSaga>` so log categories stay aligned with the saga type.
- JSON tests around workflow messages should assert the explicit `ErrorOr<T>` wrapper shape instead of flattening away `value` or `errors`.
- Timeout tests should verify timeout values come from configuration, not hardcoded saga code.

### Timeouts
- Integration tests should use a maximum of 20 seconds per test unless project docs require a stricter limit.
- Prefer `CancellationTokenSource(TimeSpan.FromSeconds(20))` for integration test timeouts.
- Unit tests should execute under 2 seconds.

## Test authoring rules

Owner directives; they apply to every project that uses this skill.

### Arrange / Act / Assert markers are required
- Every test body is split by exactly three block comments: `// Arrange`, `// Act`, `// Assert`, including a single-line assert.
- Arrange builds the input and seeds state; Act performs the single call under test; Assert holds every `ShouldBe`/`ShouldThrow`/`Should*` claim.
- Never omit a section, and never mix assertions into Arrange or Act.
- Apart from those three markers, do not write explanatory comments in a test body ("regression guard", "unique per test", rationale notes). Make intent visible through the name, the builder, and the assertions.

### Tests consume production types
- Assert on the real response DTO / contract record the host emits, including internal production types reachable through `InternalsVisibleTo`.
- Never redefine a local record, class, or constant in the test project that mirrors a production wire type, state name, or contract value: it silently stops tracking the real contract.
- Read state names, enum `Name`s, and formatting from the production type that owns them.

### One shared builder per slice
- Build request/entity input with one shared internal test-data builder per feature slice, exposed to the test project through `InternalsVisibleTo` when it lives in production or in the test setup folder when it is test-only.
- Give every builder parameter a named default so a test names only the field it varies.
- Never write inline static factories, `ForEach` request mutators, or per-test duplicated object graphs when a builder covers the shape.

### Test naming and organization
- Name tests after one behavior using `MethodUnderTest__scenario_expectedResult` with exactly TWO underscores between the method under test and the scenario.
- Use the real production entry point as the method under test, never `Test` or `Should`.
- Rename an existing test to this shape whenever you touch it; a full-suite rename needs separate approval.
- Never mix naming styles inside one touched test file: convert every test name in the file you edit.
- Do not use one underscore between method and scenario; it is indistinguishable from the scenario words.
- Do not use `Or` or `And` in test names.
- Do not combine multiple outcomes in one test name, such as `returnsSuccessOrBlocked` or `createsAndPublishes`.
- If two outcomes must be covered, write two separate tests.
- Keep one test class per source class when practical.
- Test file names should mirror source file names, for example `FooServiceTests.cs` for `FooService.cs`.
