# Olko Test

## Overview

## What I do
- Determine test scope (current git changes, plan tests, or all tests)
- Run unit tests for .NET, Python, and Android (Kotlin)
- Manage Android emulator (start, wait for boot, stop) for instrumentation tests
- Run Python integration tests
- Run .NET integration tests
- Run Android instrumentation tests (connectedCheck)
- Handle test failures by asking user how to proceed

## When to use me
User says "run tests", "test this", "/olko-test", or olko-plan-editor/olko-commit delegates test execution to me.

## Scope detection

Determine scope in this priority order:

1. **`-all` / `-a` / "for all" / "all tests"** — run every test in the entire repo (architecture tests + all .NET test projects + all Python tests + all Kotlin tests: JVM unit `./gradlew test` and instrumentation `./gradlew connectedCheck`, including Android emulator management per Step 3b)
2. **Called from olko-plan-editor skill** — read the plan file at the path olko-plan-editor passes in (do not assume a fixed location). Extract the **Tests** section — both unit and integration test names and their file paths. These are the scope.
3. **Called from olko-commit skill** — scope is the files changed in this session (tracked by olko-commit). Map changed files to affected test projects using the discovery rules below.
4. **Default (standalone invocation)** — use `git status` to find modified/new files, then map to affected test projects.

### Discovering projects & mapping changed files → tests

This skill discovers projects by convention — it does not hardcode project names or paths. All globs run from the repo root.

**Locate project roots:**
- .NET solution: find `*.sln` (or top-level `*.csproj`). Source projects = every `*.csproj` in the repo.
- Python project: find dirs containing `pyproject.toml` (or `requirements.txt`); that dir is the Python project root (run `uv`/`pytest` from there).
- Kotlin/Android project: find the dir containing `gradlew` (or `build.gradle` / `build.gradle.kts`); that is the Android project root.

**Map a changed source project → test projects (by naming convention):**
- .NET: for a source project `<Name>`, glob for `<Name>.Tests.csproj` (unit) and `<Name>.Tests.Integration.csproj` or `<Name>.Integration.Tests.csproj` (integration). Also check for a shared `<Solution>.Tests` project covering multiple source projects — if a source project has no dedicated test project, map it to the shared one. Match by project-name prefix, not by a fixed table.
- .NET architecture tests: glob for `*.Architecture.Tests.csproj` (or `*.Architecture.*.csproj`). If one exists, it is a fail-fast gate that runs whenever **any** .NET source file changes.
- Python: map a changed source module `<py-root>/src/foo/bar.py` → `<py-root>/tests/test_bar.py` (or the test file matching the module). If no specific test file maps, run the whole `<py-root>/tests/` directory.
- Kotlin: `./gradlew test` (JVM unit) and `./gradlew connectedCheck` (instrumentation) from the Android project root — run whenever any Kotlin/Android source file changes.

**Shared/contract projects:** when a changed project is shared across the codebase (contracts, application, infrastructure, persistence, or whatever the repo uses for cross-cutting layers), run **all** integration test projects in the repo, since any of them may depend on it. Detect "shared" by name convention (`*.Contracts`, `*.Application`, `*.Infrastructure`, `*.Persistence`) or by what the nearest `AGENTS.md` documents as shared.

### Filtering to specific tests

When scope comes from a plan file, filter `dotnet test` using `--filter "FullyQualifiedName~TestName1|FullyQualifiedName~TestName2"`.
For Python, run the specific test files listed in the plan (paths provided by the plan).

When scope is "all", run without filters on every test project.

When scope comes from changed files, run the full test project (no filter — any affected file might break any test in that project).
