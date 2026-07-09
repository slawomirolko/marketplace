---
name: olko-kotlin-testing
description: "Check Kotlin/Android test conventions for changed Kotlin projects with marketplace defaults. Reads project docs/adapters, maps source changes to test files, verifies instrumentation vs unit tier rules, Gradle harness conventions, no-skip/no-silent-pass policy, MockK/fake test-double boundaries, parametrization, fixture reuse, Compose UI testing conventions, Windows Gradle hang handling, new-component test requirements, cross-boundary contract tests, and reports violations with rule sources. Use when validating Kotlin/Android tests, before commit/test gates, or when olko-test/olko-commit-style delegates Kotlin test-convention checks."
---

# Olko Kotlin Testing

## What I do
- Map changed `.kt` source files to related Kotlin test files (`app/src/test` and `app/src/androidTest`).
- Read test rules from `.agents/skill-config.md`, `.agents/skills/olko-kotlin-testing/project.md`, scoped `AGENTS.md`, `TESTING.md`, and `CODING_STYLE.md`.
- Check marketplace default Kotlin/Android test conventions unless project docs override them.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `kotlinTestCommand` | `./gradlew test` | Command to run JVM unit tests. |
| `kotlinInstrumentationCommand` | `./gradlew connectedCheck` | Command to run instrumentation tests. |
| `kotlinProjectRoot` | nearest `gradlew` dir | Override Gradle project root. |
| `kotlinTestTimeoutMs` | `600000` | Explicit timeout for `./gradlew test` (Windows config-cache hang). |
| `readTestingDocs` | `true` | Whether to read test docs. |
| `kotlinTestingDocs` | `TESTING.md` | Additional test convention docs to read when present. |

## Default Kotlin test rules

Apply these defaults unless config, adapter, or project docs override them.

### Test tiers
- Main paths (happy paths, core user workflows) MUST be covered by instrumentation tests (`./gradlew connectedCheck`) using real API calls, real Compose UI, and real navigation where feasible.
- Edge cases, error paths, and boundary values MUST be covered by unit tests (`./gradlew test`) with mocked/faked dependencies.
- Unit tests must be fast, deterministic, and JVM-only (no network I/O, no device).
- Do not write an instrumentation test for algorithm edge cases such as rounding, null inputs, or boundary checks; those belong in unit tests.
- Do not write a unit test for a flow already covered by an instrumentation test.

### Test harness
- Run JVM unit tests through the documented runner (typically `./gradlew test`), invoked from the discovered Gradle project root.
- Run instrumentation tests through `./gradlew connectedCheck` (requires an emulator or device).
- Keep unit tests under `app/src/test/` and instrumentation tests under `app/src/androidTest/`.
- Keep a JUnit 4-based harness with `AndroidJUnitRunner` for instrumentation tests.
- Do not add skip logic (`@Ignore`, `Assume.assumeTrue`) for missing emulators, devices, credentials, network, or service availability.
- Do not convert failing live/instrumentation tests into skipped tests; report the real failure instead.

### No silent pass
- Never use `if (condition) { return }` or any early-return branch that bypasses assertions. A test either asserts and passes, or asserts and fails.
- Never silently return from a test when a pre-condition is not met; assert the pre-condition instead.

### Coverage
- Treat ~90% coverage as an aspirational guide, not a hard CI gate, unless project docs say otherwise.
- Use coverage to identify untested code paths, not as the only test quality signal.

### Merge similar tests
- When multiple tests exercise the same flow with the same setup and assertions but different inputs, consolidate them with parameterized tests.
- Use `@Parameterized.Parameters` with `@JvmStatic` or documented `kotlin.test` parameterized patterns.
- Do not copy-paste the same test body with different inline values; parameterize instead.

### Fixtures
- Use `@Before` (JUnit 4) for shared per-case setup; it runs before each test and guarantees isolation.
- Reset all mutable state in `@Before` — sharing mutable state between tests causes flaky tests.
- Use companion-object factories for shared test-data constants.
- Do not duplicate fixture setup across test classes.

### Test doubles
- Use `mockk<T>()` (MockK, not Mockito) to replace dependencies in unit tests.
- Stub with `every { } returns` / `coEvery { } returns`; verify interactions with `verify { }` / `coVerify { }` for suspending calls.
- Use simplified in-memory fakes (e.g. `FakeSomethingRepository`) where they decouple tests from implementation details better than mocks.
- Do not mock everything; supplement mocks with instrumentation/integration tests against real dependencies.
- Do not create test-only stubs/fakes for boundaries that instrumentation tests must exercise against the real service.

### Instrumentation boundaries
- Instrumentation tests should exercise real API/UI/navigation paths; do not mock the transport, navigation, or real external-service calls in them.
- Keep instrumentation failures visible when a service boundary is unavailable; do not hide them behind skips or fallbacks.

### Test organization and naming
- Test file names mirror source file names: `HomeViewModelTest.kt` for `HomeViewModel.kt`.
- One test class per source class.
- Each test case verifies exactly one behavior; write separate `@Test` methods per behavior, not one mega-test.
- Test one behavior at a time — bundling behaviors makes failure diagnosis difficult.

### Instrumentation test naming (non-inferable)
- Do not use backtick function names with spaces — the DEX compiler rejects spaces in method names for minSdk < 34.
- Use camelCase: `fun loginButtonClickInvokesOnLoginClick()`.
- Each test name must clearly describe the specific behavior being verified.

### Compose UI testing
- Use `createComposeRule()` from `ui-test-junit4` to host composables.
- Verify nodes with `onNodeWithText(...).assertIsDisplayed()`; simulate clicks with `onNodeWithText(...).performClick()`.
- Test state transitions through `MutableStateFlow` values, not through `ViewModel` internals.
- After a `performClick()` that triggers a state change, call `composeTestRule.waitForIdle()` before asserting on the recomposed UI — Compose recomposes asynchronously and a post-click `assertIsDisplayed()` races with recomposition.
- For nodes inside a `LazyColumn`, use `.performScrollTo().assertIsDisplayed()` (not bare `.assertIsDisplayed()`) — lazy items may not be measured/laid out until scrolled into the viewport.
- For children of merged composables (e.g. inside a `Card` with a `testTag` on the parent), use `onNodeWithTag(tag, useUnmergedTree = true)` so the test-tag lookup sees the unmerged tree.

### Gradle hang on unit tests (non-inferable)
- Running `./gradlew test` on Windows with the default config cache frequently hangs after printing `BUILD SUCCESSFUL ... Configuration cache entry reused` — the process never exits and the agent call may time out.
- When invoking unit tests from an agent, always set an explicit timeout (e.g. `timeout: 600000`) and bound captured output. Do not rely on a short default timeout.
- If the command prints `BUILD SUCCESSFUL` but the shell reports a timeout, treat the run as passed (exit code is 0); the hang is the Gradle daemon, not the test run. Kill the lingering daemon with `./gradlew --stop` if needed.
- Do not add `--no-daemon` to fix the hang — it slows every subsequent invocation and the daemon reuse is what makes incremental builds fast.

### Five qualities of a good unit test
Every unit test must satisfy all five:
1. Accurate damage detection — the test must fail when code is broken.
2. Implementation-independent — the test must still pass after refactoring internals.
3. Well-explained failure — failure messages alone must be enough to identify the problem.
4. Readable test code — tests serve as documentation; intent must be obvious.
5. Fast execution — unit tests must complete quickly since they run frequently.

### Test behaviors, not functions
- Do not mechanically create one test case per function.
- Write separate test cases for each behavior: happy path, error scenarios, boundary values, and invalid inputs.
- Test through public APIs (`ViewModel` methods, repository functions); do not change private functions to public just for testing.
- If code is too complex to test through its public API, consider splitting it into smaller units.

### Assertions
- Use `kotlin.test.assertEquals`, `kotlin.test.assertTrue`, `kotlin.test.assertFalse` (stdlib, Shouldly-like).
- Use `kotlin.test.assertFailsWith` for expected exceptions.
- For collection assertions where order does not matter, compare with `sorted()` or set equality.
- Assertions must produce clear failure messages — avoid bare `assertTrue(condition)` with no message.

### What not to test
- Do not write tests that verify configuration files (`build.gradle.kts`, `AndroidManifest.xml`, strings.xml) contain or do not contain specific keys/values. Testing file contents breaks on legitimate config changes and tests structure instead of behavior.
- Do not write tests that verify static structure: names in a config matching runtime registries, navigation-route strings matching hardcoded constants, or method existence on generated classes.
- Code reviews should catch configuration changes, not tests.

### What to test
- Test runtime behavior: how `ViewModel`s transform data, how errors are handled, how business logic produces outputs.
- Test integration points: API payload serialization/deserialization, error-body parsing, navigation transitions, external-service error handling.
- Test cross-boundary parsing where the contract is non-inferable (e.g. error `description` vs `error` code field fallbacks, server-side sort-order quirks) — pin it with an assertion that breaks if the parsing changes.

### Test philosophy
- Test behavior, not structure. If a feature is removed, delete the code and its tests together; do not keep tests that verify something was removed.
- Tests should enable change. Good tests make refactoring safer; bad tests make refactoring harder.
- Prefer tests that exercise actual code paths over tests that inspect code structure.
- Fix or quarantine flaky tests immediately; they erode suite reliability.

### New component test requirement
- When a new screen, `ViewModel`, repository, or feature is added, write tests for it before it ships.
- Write one happy-path instrumentation test per new user-facing screen/flow that exercises the real entry point with realistic inputs and asserts the expected output shape (UI state, key decisions, output non-empty).
- Write unit tests for the most common edge/error scenarios the new component will encounter.
- Test file naming: `<Name>Test.kt` (unit) and `<Name>InstrumentationTest.kt` / under `androidTest` (instrumentation).
- Do not skip these tests when they require a real device/service; failure is a real failure.
- Do not add a new screen/feature to navigation or the app without the corresponding test coverage.

### Contracts and cross-boundary validation
- Keep a test that pins the external-service client request/response shape (base URL, headers, auth, request fields) and any cross-boundary parsing (error-body field fallbacks, sort-order handling) when the project depends on one.
- Do not modify external-service infrastructure (connection URLs, endpoints, auth, headers) when the instrumentation test for that path passes.
- A passing instrumentation test that performs a real call confirms the full auth/connection chain works; only investigate connection issues when that test fails.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep `.kt` files. Group source and test files by nearest Gradle project root.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-kotlin-testing/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `TESTING.md`, and `CODING_STYLE.md` walking up from each changed file
- any additional docs listed by `kotlinTestingDocs`
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Inspect test conventions
Check only changed files plus directly related test files. Common checks:
- instrumentation tests mocking transport/navigation/real external-service calls
- unit tests doing device/network I/O
- tests that verify config-file key presence/absence or static structure
- skipped tests (`@Ignore`, `Assume.assumeTrue`) or silent early returns that bypass assertions
- duplicate test bodies that should be parameterized
- duplicated fixture setup across test classes
- backtick (spaced) instrumentation test names on minSdk < 34
- missing `waitForIdle()` after a click that changes state, or bare `assertIsDisplayed()` inside a `LazyColumn`
- missing tests for a newly added screen/ViewModel/feature
- new screens/features added to navigation without test coverage

### Step 4 - Run tests when configured
If `kotlinTestCommand` is configured or documented, run it for related test files after convention checks pass, using the explicit timeout from `kotlinTestTimeoutMs`.

Run instrumentation tests with `kotlinInstrumentationCommand` only when an emulator/device is available.

### Step 5 - Report result
If violations exist:

```text
Kotlin test convention violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No Kotlin test convention violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard Kotlin/Android test conventions per project.
- Never hardcode project-specific paths, names, fixtures, or test frameworks.
- Prefer documented project rules over generic Kotlin/Android opinions.
- Do not fix tests unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
