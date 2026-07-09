---
name: olko-python-testing
description: "Check Python test conventions for changed Python projects with marketplace defaults. Reads project docs/adapters, maps source changes to test files, verifies integration vs unit tier rules, pytest harness conventions, no-skip/no-silent-pass policy, monkeypatch/unit-only doubles, parametrization, fixture reuse, integration boundary rules, new-component test requirements, contract tests, and reports violations with rule sources. Use when validating Python tests, before commit/test gates, or when olko-test/olko-commit-style delegates Python test-convention checks."
---

# Olko Python Testing

## What I do
- Map changed `.py` source files to related Python test files.
- Read test rules from `.agents/skill-config.md`, `.agents/skills/olko-python-testing/project.md`, scoped `AGENTS.md`, `TESTING.md`, and `CODING_STYLE.md`.
- Check marketplace default Python test conventions unless project docs override them.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `pythonTestCommand` | `pytest <test-dir> -v` | Command to run Python tests. |
| `pythonTestRoot` | nearest `pyproject.toml` / `tests/` | Override test root. |
| `readTestingDocs` | `true` | Whether to read test docs. |
| `pythonTestingDocs` | `TESTING.md` | Additional test convention docs to read when present. |

## Default Python test rules

Apply these defaults unless config, adapter, or project docs override them.

### Test tiers
- Integration tests should cover main paths (happy paths, core workflows) using real services, real connections, and real external calls where feasible.
- Integration tests should use real gRPC clients, real message-broker connections, real LLM/external-service calls, or documented real dependencies.
- Do not stub, fake, mock, monkeypatch, or substitute dependencies inside integration tests.
- Unit tests should cover edge cases, error paths, and boundary values.
- Unit tests should use `monkeypatch` or `unittest.mock.patch` to replace dependencies.
- Unit tests must be fast, deterministic, and avoid network I/O.
- Do not write integration tests for algorithm edge cases such as rounding, null inputs, or boundary checks; those belong in unit tests.
- Do not write a unit test for a flow already covered by an integration test.

### Test harness
- Run the Python test harness through the documented runner (typically `pytest`), invoked the way the project docs prescribe (e.g. via `uv run`, from the discovered Python project root).
- `unittest.TestCase` and `unittest.IsolatedAsyncioTestCase` tests are valid but should still run through `pytest`.
- Keep integration tests discoverable with an `_integration.py` suffix (e.g. `test_service_integration.py`).
- Run integration-only test sets through the documented integration glob (e.g. `pytest **/test_*_integration.py -v`).
- Do not add skip logic for missing message brokers, gRPC endpoints, external services, credentials, platform tools, or service availability.
- Do not convert failing live/integration tests into skipped tests; report the real failure instead.

### No silent pass
- Never use `if condition: return` or any early-return branch that bypasses assertions. A test either asserts and passes, or asserts and fails.
- Never silently return from a test when a pre-condition is not met; assert the pre-condition instead.

### Coverage
- Treat ~90% coverage as an aspirational guide, not a hard CI gate, unless project docs say otherwise.
- Use coverage to identify untested code paths, not as the only test quality signal.

### Merge similar tests
- When multiple tests exercise the same flow with the same setup and assertions but different inputs, consolidate them with `@pytest.mark.parametrize`.
- Do not copy-paste the same test body with different inline values; parametrize instead.

### Fixtures
- Use `pytest.fixture` for shared test setup (scope: `function` default, `session` for expensive setup).
- Use `conftest.py` for fixtures shared across multiple test files.
- Do not duplicate fixture setup across test files.

### Test doubles
- Use `monkeypatch` to replace functions/modules in unit tests.
- Use `unittest.mock.patch` or `monkeypatch.setattr` for mocking in unit tests.
- Do not create internal stubs, fakes, or test-only implementations for integration tests.

### Integration boundaries
- Do not monkeypatch message brokers, gRPC clients, real LLM calls, or other real external-service calls in integration tests.
- Keep integration failures visible when a service boundary is unavailable; do not hide them behind skips or fallbacks.

### Test organization and naming
- Keep one test file per source module when practical.
- Test file names should mirror source file names, for example `test_workflow.py` for `workflow.py`.
- Each test file may contain parameterized tests for multiple scenarios.
- Use the `-v` flag for verbose output in CI and local runs.

### What not to test
- Do not write tests that verify configuration files (YAML, JSON, TOML) contain or do not contain specific keys. Testing file contents breaks on legitimate config changes and tests structure instead of behavior.
- Do not write tests that verify static structure: names in a config matching runtime registries, task/agent names matching config files, method existence on dynamically generated classes, or internal decorator-generated attributes.
- Code reviews should catch configuration changes, not tests.

### What to test
- Test runtime behavior: how methods fetch data, how errors are handled, how business logic produces outputs.
- Test integration points: gRPC client calls, message-broker publishing, API payload serialization, error handling from external services.
- Test that a task/component receives expected inputs only when the input is critical for behavior.

### Test philosophy
- Test behavior, not structure. If a feature is removed, delete the code and its tests together; do not keep tests that verify something was removed.
- Tests should enable change. Good tests make refactoring safer; bad tests make refactoring harder.
- Prefer tests that exercise actual code paths over tests that inspect code structure.
- When in doubt, delete. A test that exists "just to be safe" is probably not worth keeping.

### New component test requirement
- When a new agent, service, or component is added to a runtime registry or config, integration tests must be written for it before it ships.
- Write one happy-path integration test per new component that exercises the real entry point with realistic (mocked transport) inputs and asserts the expected output shape (schema fields, key decisions, output non-empty).
- Write integration tests for the most common production scenarios the component will encounter.
- Test file naming: `test_<component>_integration.py` for integration tests; unit tests for edge cases go in `test_<component>.py` (no `_integration` suffix).
- Do not skip these tests when they require a real external service; failure is a real failure.
- Do not add a new component to a runtime registry or config without the corresponding integration test file.

### Contracts
- Keep a contract test that pins the external-service client request shape (e.g. base URL, headers, auth, request fields) when the project uses one.
- Do not modify external-service infrastructure (connection URLs, model/endpoint names, API keys, environment variables, headers) when the integration test for that path passes.
- A passing integration test that performs a real external call confirms the full auth/connection chain works; only investigate connection issues when that test fails.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep `.py` files. Group source and test files by nearest `pyproject.toml` root.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-python-testing/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `TESTING.md`, and `CODING_STYLE.md` walking up from each changed file
- any additional docs listed by `pythonTestingDocs`
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Inspect test conventions
Check only changed files plus directly related test files. Common checks:
- integration tests using mocks, stubs, fakes, substitutes, or `monkeypatch` on real boundaries
- unit tests doing I/O-heavy integration work
- tests that verify config-file key presence/absence or static structure
- skipped tests or silent early returns that bypass assertions
- duplicate test bodies that should be parameterized
- duplicated fixture setup across test files
- missing integration tests for a newly added runtime component
- contract tests that flatten or drop the pinned request shape
- new components in a runtime registry/config without a matching `test_<component>_integration.py`

### Step 4 - Run tests when configured
If `pythonTestCommand` is configured or documented, run it for related test files after convention checks pass.

Run from the discovered Python project root or documented working directory. Use the exact invocation the docs prescribe (e.g. `uv run --directory <py-root> pytest ...`).

### Step 5 - Report result
If violations exist:

```text
Python test convention violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No Python test convention violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard Python test conventions per project.
- Never hardcode project-specific paths, names, fixtures, or test frameworks.
- Prefer documented project rules over generic Python opinions.
- Do not fix tests unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
