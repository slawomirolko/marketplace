# Olko Test

## Workflow

### Step 0 — Load adaptation
Read `.agents/skill-config.md` first. If `projectAdapter` is not `false`, load `.agents/skills/olko-test/project.md` when present. Apply precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Use configured test commands, arguments, emulator timeout, and explicit `uses` dependencies from those layers before applying marketplace defaults.

### Step 0a - Detect and prepare a Git worktree Compose stack

Before running any test stage:

1. Resolve the current repository, `git-dir`, and `git-common-dir`. The current directory is a linked worktree only when the resolved `git-dir` differs from the resolved common directory. Do not classify the main checkout from its folder name.
2. Discover the configured wrapper, default `scripts/tests/worktree-compose.ps1`, and matching scripts, default `scripts/tests/worktree-compose*.ps1`. Exclude the wrapper and sort remaining scripts deterministically.
3. Resolve a shell-safe, worktree-specific Compose project name, env file, and port offset. The project name must not equal the main project name. Missing required values fail visibly; never fall back to the main project or ports.
4. Invoke the wrapper with `COMPOSE_PROJECT_NAME` set and pass `-WorktreePath`, `-ProjectName`, `-EnvFile`, and `-PortOffset`. The wrapper owns the repository Compose file and services.
5. Mark the isolated stack as owned by this run. Pass the same four values to every worktree test script and tear down the stack in the `finally` path.

If no linked worktree, wrapper, or matching scripts are found, continue with the existing workflow unchanged.

### Step 1 — Announce scope
Tell the user what tests will run and why, listing the discovered project paths:
```
Olko-test scope:
  - Architecture: <discovered>.Architecture.Tests
  - Unit: <discovered>.Tests, <py-root>/tests/
  - Integration: <discovered>.Tests.Integration
  - Reason: <project> changed
Proceeding...
```

### Step 1a — Architecture & coding-style compliance gate
Before running any tests, verify the changed code complies with the conventions defined in the repo's `AGENTS.md` / `CODING_STYLE.md` / `TESTING.md` reference files. This step is a **delegation gate** — it does not encode rules. It loads the rules from the docs and runs the appropriate tools.

If stack-specific skills are declared in `.agents/skills/olko-test/project.md`, delegate the matching changed files and follow their result before running tests:

```yaml
uses:
  - olko-dotnet-style
  - olko-dotnet-architecture
  - olko-dotnet-testing
  - olko-docker-style
  - olko-python-architecture
  - olko-python-style
  - olko-python-testing
  - olko-kotlin-architecture
  - olko-kotlin-style
  - olko-kotlin-testing
  - olko-react-architecture
  - olko-react-style
  - olko-react-testing
```

If a dependency is not declared, run the built-in document-based checks below.

**Skip this step** only when there are no staged/unstaged source files:
```bash
git status --porcelain
git diff --name-only HEAD
```

**Group changed files by stack** using project markers (not fixed path prefixes):

| Stack | Markers (file / project root) | Reference docs (walk up the tree from each changed file) |
|---|---|---|
| .NET | changed `.cs`/`.csproj`; belongs to nearest `*.csproj` | nearest `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` up the dir tree + repo root |
| Docker | changed `Dockerfile*`, `*.Dockerfile`, `.dockerignore`, `compose*.yml`, `compose*.yaml`, `docker-compose*.yml`, `docker-compose*.yaml` | nearest `AGENTS.md`, `DOCKER.md`, `CODING_STYLE.md`, `TESTING.md` up the dir tree + repo root |
| Python | changed `.py`; belongs to nearest `pyproject.toml` dir | nearest `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` up the dir tree + repo root |
| Kotlin/Android | changed `.kt`/`.kts`; belongs to nearest `gradlew` dir | nearest `AGENTS.md`, `CODING_STYLE.md`, `Testing.md` up the dir tree + repo root |
| React/TypeScript | changed `.ts`/`.tsx`; belongs to nearest `package.json` beside `vite.config.ts`/`.js` | nearest `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` up the dir tree + repo root |

**Per-stack checks — read the reference docs above first, then run the tooling the docs prescribe.**

**.NET (C#):**
1. Read the nearest `AGENTS.md` / `CODING_STYLE.md` / `TESTING.md` (and repo root `AGENTS.md`) to learn the current architecture + style + test rules.
2. Map each changed `.cs` to its source `.csproj` (use the discovery rules above; pick the source project, not the test project).
3. Run the style tool those docs reference (typically `dotnet format <project>.csproj --verify-no-changes --no-restore` from repo root, or whatever the docs prescribe).
4. Cross-check changed files against the architecture + test rules in the docs by inspection (e.g. dependency direction, repository scope, test-double convention). Report any violations you find.

**Python:**
1. Read the nearest `AGENTS.md` / `CODING_STYLE.md` / `TESTING.md` to learn the current rules.
2. Run the style tool the docs reference (typically `ruff check` + `ruff format --check`, or a project-specific task — use what the docs prescribe, run from the discovered Python project root).
3. Cross-check changed files against architecture + test rules in the docs (e.g. dependency direction, no hand-edited gRPC stubs, integration vs unit tier boundaries, no-skip/no-silent-pass, parametrization, fixture reuse). Report violations.

**Docker:**
1. Read the nearest `AGENTS.md` / `DOCKER.md` / `CODING_STYLE.md` / `TESTING.md` and repo root `AGENTS.md` to learn the current Docker rules.
2. Run the Docker style/validation tool the docs reference. If a Compose file changed and docs do not override it, run `docker compose config` from the documented Compose working directory.
3. Cross-check changed Dockerfiles, `.dockerignore`, and Compose files against documented Docker rules. Report violations for build stage separation, base image tags, layer caching, non-root runtime users, healthchecks, exec-form entrypoints, minimal runtime packages, build-context exclusions, Compose secrets, service healthchecks, restart policy, volumes, and networking.

**Kotlin/Android:**
1. Read the nearest `AGENTS.md` / `CODING_STYLE.md` / `Testing.md` to learn the current rules.
2. Run the style/test-tool task the docs reference (e.g. `./gradlew ktlintCheck`, `./gradlew :app:detekt`, or `./gradlew test` — whichever the docs prescribe, from the Android project root). If no linter is configured, the docs will say so; skip the linter and continue.
3. Cross-check changed files against architecture + test rules in the docs (e.g. MVVM/repository boundaries, no `!!` in production, no business logic in composables, instrumentation vs unit tier boundaries, no-skip/no-silent-pass, parametrization, fixture reuse, Compose UI testing conventions). Report violations.

**React (TypeScript):**
1. Read the nearest `AGENTS.md` / `CODING_STYLE.md` / `TESTING.md` to learn the current rules.
2. Run the style tool those docs reference (typically `npm run lint` / `npx eslint .`, and `npx prettier --check .` when configured — use what the docs prescribe, run from the discovered Vite/React project root).
3. Cross-check changed files against architecture + test rules in the docs (e.g. React Query data-layer ownership, typed API client centralization, CSS Modules boundaries, React Hook Form conventions, Vitest + Testing Library + MSW harness conventions, no-skip/no-silent-pass, parametrization, fixture reuse). Report violations.

**If the gate fails** (style tool non-zero, or a documented rule violation is found):
Show the offending file(s), a snippet of the error, and the source rule (with the AGENTS.md / CODING_STYLE.md / TESTING.md file and line that defines it). Then ask via question tool:
- **"Fix style automatically (recommended)"** — run the auto-fix command prescribed by the docs, then re-verify
- **"Skip style check and run tests anyway"** — proceed to Step 1b with a visible warning naming the skipped stack
- **"Abort"** — stop

If auto-fix still fails, report the remaining violations (with the rule source) and stop — do not proceed to tests.

**If the gate passes (or the user chose to skip):** continue to Step 1b.

**Note:** The rule source of truth is the referenced markdown file, not this skill. If a rule here ever contradicts a doc, the doc wins — surface the conflict to the user.

### Step 1b — Run architecture tests (.NET)

If **any** .NET source file changed, glob for an architecture test project (`*.Architecture.Tests.csproj` or `*.Architecture.*.csproj`). If found, run it as a fail-fast gate:

```bash
dotnet test <discovered-architecture-project>.csproj --no-restore
```

Architecture tests enforce design rules (dependency direction, naming conventions, layer boundaries). If any fail, **stop immediately**, report the failures with the violated rule, and jump to Step 5 (failure handling). Do NOT proceed to unit or integration tests.

If no .NET source files changed, or no architecture test project exists, skip this step.

### Step 2 — Run unit tests (.NET)
For each discovered .NET unit test project in scope:
```bash
dotnet test <project>.csproj --no-restore
```
Collect results. If any fail, **stop immediately**, report failures, and jump to Step 5 (failure handling). Do NOT proceed to Python unit tests or integration tests.

### Step 3 — Run unit tests (Python)
From the discovered Python project root:
```bash
uv run --directory <py-root> pytest <test_files> -v
```
Collect results. If any fail, **stop immediately** and jump to Step 5.

### Step 3a — Run unit tests (Android/Kotlin)
If Kotlin/Android source changed and there are unit tests:
```powershell
powershell -File .agents/skills/olko-test/scripts/invoke-gradle-watchdog.ps1 `
  -ProjectRoot apps/mobile `
  -GradleArguments ':app:testDebugUnitTest --console=plain --no-configuration-cache --max-workers=1' `
  -TimeoutSeconds 600
```
Use the debug variant once; the lifecycle `test` task repeats the same JVM tests for Debug and Release. The watchdog reuses the compose-managed `pricepredictor.android-emulator` container, which is self-sufficient: JDK 25 (`/usr/lib/jvm/java-25-openjdk-amd64`), Android SDK at `/opt/android` (`platforms;android-35` + `build-tools;35.0.0`), and a pre-cached Gradle 9.7.1 distribution in `/opt/gradle-home`. It `docker cp`s the project into `/opt/workspace/olko-gradle-<guid>/` inside the container (dodging 9p stale-cache on the bind mount) and runs `./gradlew` **inside the container** — no Gradle runs on the Windows host. On timeout it stops streaming and reports `GRADLE_COMPLETION_MISSING` — the container workload is never killed or stopped. Working directory: repository root.

**GUARDRAIL (user directive 2026-09-14): container creation outside the `pricepredictor` Docker Compose stack is PROHIBITED.** Both watchdog scripts enforce this: `docker run`/`docker build` were removed. The emulator container must already be running; if missing or stopped, the script throws `GUARDRAIL BLOCKER` — report it, do not create or start anything (lifecycle is owned by `scripts/tests/android-emulator.ps1` / the compose stack). The scripts verify in-container prerequisites before running (JDK 25, `/opt/android/platforms/android-35`, `/opt/gradle-home/wrapper/dists/gradle-9.7.1-bin`) and throw a precise blocker instead of installing anything.

Collect results. If any fail, **stop immediately** and jump to Step 5.

### Step 3b+3c — Android instrumentation tests (ONE script, ONE tool call)

**MANDATORY — NON-NEGOTIABLE (user directive, 2026-09-04): when ANY Kotlin/Android
file changed — production OR test — the FULL instrumentation suite
(`connectedDebugAndroidTest`, no class filters) MUST run. Never run a subset,
never skip, never report instrumentation as optional. The only acceptable
outcome is: instrumentation PASSED, or instrumentation FAILED (jump to Step 5),
or an explicit BLOCKER recorded after the emulator start/recovery procedure was
exhausted. "No emulator available" is not a terminal state — the Docker
emulator can always be started (Step 0a / the watchdog script starts it).**

If Kotlin/Android source changed and there are instrumentation tests (`connectedCheck`):

**Run the combined instrumentation watchdog from the repo root:**
```powershell
powershell -File .agents/skills/olko-test/scripts/invoke-instrumentation-watchdog.ps1 `
  -ProjectRoot apps/mobile `
  -BootTimeoutSeconds 120 `
  -TestTimeoutSeconds 600
```

The script handles EVERYTHING atomically:
1. Emulator container check (requires `pricepredictor.android-emulator` already running; verifies boot via container-local `adb getprop sys.boot_completed`; never starts/creates containers).
2. JDK 25 verification inside the emulator container (the container ships JDK 25 + Android SDK 35 + pre-cached Gradle 9.7.1; no build container exists anymore).
3. Stale-output cleanup (removes old androidTest-results to prevent file-lock failures).
4. Test execution (`connectedDebugAndroidTest` inside the emulator container, project `docker cp`'d into `/opt/workspace/olko-instrumentation-<guid>/`, watchdog timeout, streams output).
5. Error diagnostics (on failure, parses XML results, dumps every failed test name and message).
6. No teardown — the emulator container is left running/unchanged (it must already be running when the script starts).

**Verify the backend/auth service is reachable from the emulator container before running instrumentation tests.** Instrumented tests read the host endpoint from `BuildConfig.ANDROID_TEST_*_BASE_URL` (derived from the Gradle property `pricePredictorAndroidTestHost`); check that host from inside the emulator container:

```powershell
docker exec pricepredictor.android-emulator sh -lc "wget -q -S -O /dev/null http://<androidTestHost>:<port>/<health-or-well-known-path> 2>&1 | head -1"
```

Use the host and port the repo's `apps/mobile/AGENTS.md` and `app/build.gradle.kts` define — do not assume defaults. **Do NOT use `10.0.2.2`:** inside the Docker emulator it resolves to the emulator container itself and returns `ECONNREFUSED` (non-inferable project rule, verified 2026-08-17). If the service is not reachable → warn the user which service is unreachable and that they should ensure the relevant compose services are running. **Do not stop; proceed anyway** — the test will report the real failure.

Gradle and the emulator run in the same Docker container — nothing runs on the Windows host. The emulator service is defined in the local-only `compose.override.yaml` (gitignored) with `/dev/kvm` passthrough, built from `apps/mobile/docker/android-emulator.Dockerfile`.

Exit codes: 0 = all passed, 1 = tests/build failed (details in output).

The script's FINAL output line is always a hard marker: `[OLKO-TEST-DONE] result=passed|failed exit=N`. When the bash tool returns and you see this marker, the run is FINISHED — there is nothing left to wait for. Read `exit`:
- `exit=0` → instrumentation PASSED. Your VERY NEXT message must continue this workflow (move to Step 4 / Step 6). Do NOT produce a standalone "tests passed" reply to the user. Do NOT stop. Do NOT wait.
- `exit=1` → jump to Step 5.

No cleanup is needed — the script never starts, stops, or removes the emulator container; it is left running and unchanged.

### Step 3d — Run unit/component tests (React/TypeScript)
If React/TypeScript source changed, run the configured Vitest command from the discovered Vite/React project root:
```bash
npx vitest run
```
Use the explicit timeout from `reactTestTimeoutMs` (default `120000`) when invoking from an agent.

Collect results. If any fail, **stop immediately**, report failures, and jump to Step 5. Manual e2e verification against the running dev server (`agent-browser`, per `olko-react-testing`) is on-demand only and is never run automatically here.

### Step 4 — Run .NET integration tests
For each discovered .NET integration test project in scope:
```bash
dotnet test <project>.csproj --no-restore
```

### Step 4a - Run worktree Compose scripts and clean up

When Step 0a prepared a stack, run every discovered `worktree-compose*.ps1` test script with the resolved worktree path, isolated project name, env file, and port offset. Wrap startup, normal test execution, and script execution in `try/finally`.

In `finally`, invoke wrapper teardown for only the isolated project with the same values. Never run an unqualified `docker compose down`. If a test or service command fails, retain its original exit code and output; cleanup still runs and cleanup errors are secondary context. Docker or service failures are never converted into skips or success.
Collect results. If any fail, jump to Step 5.

**Android emulator:** No manual cleanup needed — under the container guardrail the emulator container is never started, stopped, or removed by this skill; `invoke-instrumentation-watchdog.ps1` requires `pricepredictor.android-emulator` to already be running and leaves it unchanged. Do NOT kill or remove the container. (The legacy `invoke-emulator-watchdog.ps1` two-script flow is not part of the current path.)

### Step 5 — Handle test failures
Show:
- Which test failed
- The failure message
- Which changed file(s) likely caused it

Ask via question tool:
- **"Fix the tests (recommended)"** — update test code
- **"Fix the implementation"** — change source code
- **"Skip and continue"** — ignore failures, proceed with rest of workflow
- **"Abort"** — stop

Act based on user choice. If "Fix the tests" or "Fix the implementation", make changes then return to Step 2.

### Step 6 — Report summary
```
All tests passed:
  - Unit:           12 passed, 0 failed (<project>.Tests)
  - Unit:            3 passed, 0 failed (Python)
  - Unit:            8 passed, 0 failed (React/Vitest)
  - Integration:     5 passed, 0 failed (<project>.Tests.Integration)
  - Instrumentation: 125 passed, 0 failed (apps/mobile :app:connectedDebugAndroidTest)
```

Every test tier that actually ran MUST appear as a line in the summary. If instrumentation tests ran (Step 3b+3c), the summary MUST include the `Instrumentation:` line — never omit it. A missing tier line is a bug. If any Kotlin file changed and instrumentation did NOT run, the summary MUST instead include an explicit `Instrumentation: BLOCKED — <reason>` line; silently omitting instrumentation for a mobile change is a workflow violation.

**After printing the summary, IMMEDIATELY return control to the calling skill.** Do NOT stop. Do NOT ask "shall I continue?". Do NOT wait for user input. Your next action is the calling skill's next step (e.g. `olko-implement-new` resume). If there is no calling skill (standalone invocation), the workflow is complete.
