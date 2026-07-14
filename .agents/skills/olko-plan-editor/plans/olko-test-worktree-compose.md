# olko-test: Git worktree Compose isolation

## Goal

Extend `olko-test` so tests started from a Git worktree use an isolated Compose project and are always cleaned up, while preserving the existing .NET, Python, and Kotlin/Android paths. Do not add any skip behavior for missing Docker or unavailable services.

## Current state found

- `skills/testing/olko-test/workflow.md` discovers `.NET`, Python, and Android/Kotlin test scope, but has no worktree detection or Compose lifecycle.
- `skills/testing/olko-test/overview.md` documents only the existing cross-stack behavior and adapter keys.
- `skills/testing/olko-test/edge-cases.md` forbids skip logic and requires Compose-file discovery, but does not define worktree isolation or failure cleanup.
- `skills/git/olko-worktree-merge/workflow.md` already uses Compose project metadata and `docker compose -p ... down --volumes --remove-orphans` for worktree cleanup; reuse the safety principles, but keep test startup/cleanup inside `olko-test`.
- Marketplace tests are Node test files under `scripts/`; there is no existing executable `olko-test` runtime helper or worktree test suite.

## Changed files

### Skill documentation

- `skills/testing/olko-test/SKILL.md` — describe worktree-aware Compose behavior in the routing summary and preserve the existing stack scope.
- `skills/testing/olko-test/overview.md` — document defaults and configuration/adapter keys for worktree Compose execution.
- `skills/testing/olko-test/workflow.md` — add the worktree lifecycle around the unchanged stack test stages.
- `skills/testing/olko-test/edge-cases.md` — define failure, missing wrapper, missing Docker/service, project-name, port-offset, and cleanup rules.

### Test harness

- `scripts/olko-test-worktree.mjs` — add small repository-agnostic helpers for worktree detection, wrapper/test-script discovery, isolated project/port arguments, and command planning. Keep process execution injectable so unit tests do not require Docker.
- `scripts/olko-test-worktree.test.mjs` — unit tests for detection and command planning, plus integration-style tests using a temporary fixture and fake command runner.

No changes to `skills/git/olko-commit/**` or `skills/workflow/olko-implement-new/**`. No new registry skill is required; run registry validation if the skill file list or generated metadata changes.

## Application flow

1. Load `.agents/skill-config.md`, the optional `.agents/skills/olko-test/project.md`, and `AGENTS.md` according to the existing precedence. Add optional adapter overrides only for wrapper name, env-file selection, project-name prefix, port-offset strategy, and test-script glob; retain generic defaults.
2. Resolve the current repository and worktree with Git (`git rev-parse`/`git worktree list --porcelain`). Treat the main checkout as non-worktree unless Git metadata proves the current directory is a linked worktree. Preserve normal behavior when no worktree is detected.
3. In a worktree, discover the repository wrapper `scripts/tests/worktree-compose.ps1`. If present, invoke it to obtain or establish the worktree Compose inputs: worktree path, isolated `COMPOSE_PROJECT_NAME`, env file, and port offset. Never infer or reuse the main project name or main published ports.
4. Discover `scripts/tests/worktree-compose*.ps1` test scripts, excluding the setup wrapper where appropriate. Pass every script the resolved worktree path, project name, env file, and port offset using the documented PowerShell parameter/argument contract. Preserve deterministic ordering.
5. Before test commands, start the isolated Compose project through the wrapper with `COMPOSE_PROJECT_NAME` explicitly set. Use the worktree Compose file/context and the project-specific env file. Do not run `docker compose up` against the main project as a fallback.
6. Run the existing architecture, .NET, Python, JVM, Android instrumentation, and integration stages with their current scope/filter behavior. Add the discovered worktree Compose test scripts at the configured integration point, passing all four worktree values.
7. Wrap startup, test execution, and script execution in a `try/finally` equivalent. On success and failure, call the wrapper/Compose teardown for only the isolated project, with volumes/orphans behavior defined by the wrapper contract.
8. Preserve the original test/script exit code and failure output. Cleanup failure must be reported as secondary context and must not replace a real test failure. A missing Docker daemon, service, or dependency must surface as the actual command failure; never convert it into a skip or success.
9. If startup fails before a project is created, still execute cleanup defensively using the resolved isolated project name and report whether resources were found. Never target the main Compose project.

## Worktree/Compose contract

- Detection is based on Git metadata, not directory naming.
- The isolated project name is deterministic, worktree-specific, and shell-safe; it must not equal the configured/main project name.
- `COMPOSE_PROJECT_NAME` is set in the process environment and, where supported, passed explicitly to wrapper commands.
- The env file and port offset are resolved once and passed unchanged to every worktree test script.
- Port offset is required for published ports; collisions must fail visibly rather than silently binding main-stack ports.
- Wrapper and test scripts are discovered by repository-relative convention, with adapter overrides taking precedence.
- Cleanup is scoped by the isolated project name and worktree Compose inputs; never run an unqualified `docker compose down`.

## Design patterns

- **Existing workflow preservation:** insert the new lifecycle around current stack-specific stages instead of rewriting their commands.
- **Repository convention with adapter override:** use `scripts/tests/worktree-compose*.ps1` defaults while allowing project configuration to specialize names and arguments.
- **Dependency injection for process execution:** inject command/environment runners in the helper so unit tests cover decisions without Docker.
- **Finally-based resource ownership:** once isolated Compose startup is attempted, cleanup is mandatory and scoped.
- **Failure precedence:** retain the first/real test failure; attach cleanup failures without masking it.

## Tests

### Unit tests — `scripts/olko-test-worktree.test.mjs`

- `detects linked worktree from Git metadata` — fixture with `git worktree list --porcelain` output.
- `does not classify the main checkout as a worktree` — main-checkout metadata fixture.
- `discovers wrapper and worktree-compose test scripts deterministically` — temporary repository fixture with matching and non-matching scripts.
- `builds isolated project name that differs from main project` — project-name and shell-safety boundaries.
- `passes worktree path, project name, env file, and port offset to wrapper/test commands` — exact command/environment contract.
- `never emits an unqualified or main-project Compose command` — command-plan safety assertion.
- `preserves the real test exit code when cleanup also fails` — failure-precedence decision test.

### Integration tests — `scripts/olko-test-worktree.test.mjs`

- `starts an isolated Compose project and runs worktree-compose test scripts` — temporary fixture plus fake Docker/PowerShell runner; assert `COMPOSE_PROJECT_NAME`, env file, worktree path, and port offset.
- `cleans the isolated Compose project after successful tests` — assert the matching `down` command is issued in the finally path.
- `cleans the isolated Compose project after a failing test and exposes the original failure` — fake test exits non-zero, teardown still runs, and the original status/output remains visible.
- `does not skip when Docker or a required service command fails` — failed command is returned as failure, with cleanup attempted.

Do not assert only log text. Assert command arguments, environment, ordering, cleanup invocation, and exit status. Reuse one fixture Arrange across unit/integration cases where possible.

## Tradeoffs and assumptions

- A small executable helper is preferable to testing Markdown prose alone because project-name isolation, argument propagation, and finally semantics need deterministic assertions. The skill remains the user-facing workflow and calls the helper contractually.
- Fake command runners keep marketplace CI independent of a local Docker daemon while integration tests still exercise the complete orchestration. A real Docker test is intentionally not required in the marketplace repository.
- The wrapper remains project-owned and can choose the exact Compose file/services. `olko-test` must not invent service names or health-check paths.
- If a project has no wrapper or matching test scripts, retain existing test execution and report that no worktree Compose extension was found; do not skip the normal tests.

## External dependencies

None. Use Node built-ins and the existing marketplace test runner.

## Verification

- `node --test scripts/olko-test-worktree.test.mjs`
- `node --test scripts/*.test.mjs`
- `node scripts/registry.mjs`

