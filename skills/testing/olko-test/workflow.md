# Olko Test

## Workflow

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
If Kotlin/Android source changed and there are unit tests (JVM `./gradlew test`):
```bash
./gradlew test
```
Working directory: the discovered Android project root (where `gradlew` lives).

Collect results. If any fail, **stop immediately** and jump to Step 5.

### Step 3b — Manage Android emulator (for instrumentation tests)
If Kotlin/Android source changed and there are instrumentation tests (`connectedCheck`):

**Pre-flight checks:**
Verify `$env:ANDROID_HOME` is set and both `emulator.exe` and `adb.exe` exist:
```powershell
if (-not $env:ANDROID_HOME) { Write-Error "ANDROID_HOME environment variable is not set."; exit 1 }
$emuPath = "$env:ANDROID_HOME\emulator\emulator.exe"
$adbPath = "$env:ANDROID_HOME\platform-tools\adb.exe"
if (-not (Test-Path -LiteralPath $emuPath)) { Write-Error "Emulator executable not found at $emuPath."; exit 1 }
if (-not (Test-Path -LiteralPath $adbPath)) { Write-Error "adb executable not found at $adbPath."; exit 1 }
```
Set up `$adb` alias for the rest of this step:
```powershell
function adb { & $adbPath @args }
```
If any check fails → tell user the specific error and stop. Do not attempt to start the emulator.

**Find available AVD:**
```powershell
& $emuPath -list-avds
```
If no AVDs → tell user: "No Android emulator AVD found. Create one in Android Studio AVD Manager and try again." **Do not ask for emulator.**

**Check if emulator is already running:**
```powershell
$alreadyRunning = (adb devices 2>$null | Select-String "emulator.*device$").Count -gt 0
```
If already running → skip start and boot wait, jump directly to **Verify backend reachable from emulator** below.

**Start emulator (headless):**
```powershell
Start-Process -NoNewWindow -FilePath $emuPath -ArgumentList "-avd","<avd_name>","-no-window","-no-audio","-gpu","swiftshader_indirect"
```
Note: Use `-no-window` to keep it headless. Emulator process stays alive.

**Wait for boot:**
```powershell
adb wait-for-device
```
Then poll until `sys.boot_completed=1` with a 120-second timeout:
```powershell
$maxWait = 120; $elapsed = 0; $interval = 2
do {
  Start-Sleep -Seconds $interval; $elapsed += $interval
  $status = adb shell getprop sys.boot_completed 2>$null
  if ($elapsed -gt $maxWait) { Write-Error "Emulator did not boot within ${maxWait}s. Last status: $status"; exit 1 }
} while ($status -ne "1")
```
If timeout expires → tell user: "Emulator failed to boot within 120 seconds. Try closing the emulator and re-running, or check AVD configuration in Android Studio." Stop.

**Verify backend reachable from emulator:**
If the instrumentation tests depend on a backend/auth service reachable from the emulator, verify it at its configured address. The emulator reaches the host loopback via `10.0.2.2`:
```powershell
adb shell curl -s -o /dev/null -w "%{http_code}" http://10.0.2.2:<port>/<health-or-well-known-path>
```
Use the port and path the repo's config/docs define — do not assume defaults. If the repo has no such dependency, skip this check.
If not reachable → warn user which service is unreachable and that they should ensure docker compose (or the relevant runtime) is running. **Do not stop; proceed anyway** — the test will report the real failure.

### Step 3c — Run Android instrumentation tests
```bash
./gradlew connectedCheck
```
Working directory: the discovered Android project root.

Collect results. If any fail, jump to Step 5.

### Step 4 — Run .NET integration tests
For each discovered .NET integration test project in scope:
```bash
dotnet test <project>.csproj --no-restore
```
Collect results. If any fail, jump to Step 5.

**Android emulator** (if started in Step 3b):
```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" emu kill
```
This stops the emulator and releases resources. Do NOT kill emulator if it was already running before the test run — only kill if we started it.

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
  - Unit:     12 passed, 0 failed (<project>.Tests)
  - Unit:      3 passed, 0 failed (Python)
  - Integration: 5 passed, 0 failed (<project>.Tests.Integration)
```
