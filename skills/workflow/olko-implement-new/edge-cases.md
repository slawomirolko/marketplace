# Olko Implement New Edge Cases

## Configuration Keys

Read these keys from `.agents/skill-config.md`, then `.agents/skills/olko-implement-new/project.md`; project adapter wins.

- `branchPrefix`: branch prefix for suggestions and slug derivation. Default: `feature/`.
- `planDirectory`: default directory for plan names without paths. Default: `.agents/skills/olko-plan-editor/plans`.
- `trackerGlob`: tracker file glob. Default: `implement-new_*.md`.
- `uses`: explicit skill dependencies. Default: empty.
- `instrumentationPatterns`: strings that count as logging/telemetry. Default: common logger and tracing names.
- `environmentFileGlobs`: local environment files copied from main checkout to worktree. Default: empty.
- `environmentTemplateGlobs`: environment templates never copied as secrets. Default: common example/template names.
- `styleCommands`: path-matched style check commands. Default: empty.
- `styleFixCommands`: path-matched auto-fix commands. Default: empty.
- `testCommands`: deprecated — no longer used. Tests are ALWAYS delegated to `olko-test`. Kept for backward compatibility but ignored. **NEVER run test commands manually from this skill.**
- `serviceMap`: changed-path to service-name mapping. Default: empty.
- `neverRebuildServices`: services never rebuilt by this skill. Default: empty.
- `composeBuildTemplate`: service build command template. Default: `docker compose build {service}`.
- `composeUpTemplate`: service start command template. Default: `docker compose up -d {service}`.
- `composeStatusCommand`: service status command. Default: `docker compose ps`.
- `logCommands`: service log commands. Default: compose recent logs when compose is configured.
- `dbConnectionString`: connection string (or settings key path) for Step 7b DB verification. Default: unset — ask the user when a data-mutating plan needs DB verification. Never guess.
- `dbConnectionSettings`: alternative to `dbConnectionString` — a path to a settings file + key (e.g. `appsettings.json:ConnectionStrings:Default`). Project adapter wins. Default: unset.
- `dbQueryCommand`: read-only query command template for Step 7b DB verification. Default: ask the user for a psql/sqlcmd/dotnet-ef wrapper. Read-only SELECTs ONLY — no INSERT/UPDATE/DELETE from this step.
- `dbSystem`: optional DB system hint (`postgres`, `sqlserver`, `sqlite`, `mysql`). Used to pick the right `information_schema` query shape. Default: inferred from connection string.
- `lokiUrl`: optional Loki base URL. Default: unset.
- `tempoUrl`: optional Tempo base URL. Default: unset.
- `verificationActions`: feature trigger instructions for the user. Default: ask only when the code path cannot be triggered automatically.
- `allowGitignoreTrackerPattern`: whether tracker ignore pattern may be written to `.gitignore`. Default: false; use `.git/info/exclude`.

## Resume Rules

- `CURRENT` marker must exist on exactly one step.
- Mark a step `[x]` only after it fully completes.
- Never skip incomplete steps unless the user explicitly approves.
- Re-read plan files and `## Changed files` before resuming Step 3.
- Verify already-changed files still match the plan before skipping them.
- Preserve tracker failure context until the retried step succeeds.

## Plan Rules

- Plans are the implementation source of truth.
- Plans are read and updated in the main checkout before worktree creation.
- Implementation happens only in the created worktree.
- If a plan contradicts actual code, report it during cross-check or implementation and ask how to proceed.
- Remove plan files only after successful merge and explicit user approval.

## Test Rules

- NEVER run `dotnet test`, `gradlew test`, `pytest`, or any test runner manually from this skill.
- Tests are ALWAYS delegated to `olko-test` in Step 5.
- If you need to verify code compiles after implementation, use build/compile commands (`dotnet build`, `gradlew compileKotlin`), NOT test commands.

## Service Rules

- Service rebuild and log verification are **MANDATORY and never optional**. There is no skip path.
- Never rebuild services excluded by `neverRebuildServices`.
- If `serviceMap` is configured, resolve services from it. If it yields nothing for the changed paths, fall through to auto-discovery (below) — do NOT skip.
- If no `serviceMap` is configured, **auto-discover** services from the repository Compose file: a service is affected when a changed path falls under its `build.context`/`build.dockerfile`, or when the change is in a shared library/module the service compiles. When blast radius is ambiguous, include the service.
- If auto-discovery also yields zero services (docs-only change, or no Compose file), **ASK the user** which services to rebuild. Never continue silently with an empty set.
- Build from the worktree (new code) using the same Compose project name as the running stack so the rebuilt image replaces the running container without disturbing the rest of the stack.
- Ask before rebuild, restart, commit, push, PR merge, cleanup, or plan deletion.
- If service health cannot be determined, report that gap as a failure — do not assume success and do not skip.
- Step 7 (log/trace verification) always runs after Step 6 for every rebuilt service. There is no N/A path except an explicitly user-confirmed empty rebuild set.
- Step 7b (DB verification) is **MANDATORY** for any plan that mutates persisted state. Logs passing is NOT sufficient. The implementer MUST query the live DB and confirm every property/value the plan describes is applied at runtime. There is no skip path. If no `dbConnectionString`/`dbConnectionSettings`/`dbQueryCommand` is configured, ASK the user — never skip.
- If any DB verification row is `[FAIL]` or `[MISSING]`, fix the code and loop back to **Step 3a** (rules re-check), then re-run 3a → 4 → 5 → 6 → 7a → 7b. Edits that fix DB state can introduce rule/style/test regressions, so the full gate re-runs. Do NOT loop back to 7b directly — always go through 3a.
- Raw SELECT queries are allowed in Step 7b ONLY for read-only verification despite repo raw-SQL bans. This step writes no application code and runs no INSERT/UPDATE/DELETE — it only verifies existing rows.
- Step 11 (post-merge rebuild and verify) always runs after Step 10 when the PR was merged in Step 9. It rebuilds the same affected services from the main checkout (not the worktree, which is removed in Step 9) and re-verifies their logs. If the PR was not merged (declined or left open), skip with an explicit message. Derive changed paths from the squash merge commit (`git diff HEAD~1..HEAD --name-only`) since the tracker is gone after worktree removal.
- Step 11 MUST also re-run Step 7b DB verification after the post-merge rebuild, using the same DB Verification Matrix as the pre-merge Step 7b. The post-merge stack must satisfy the same plan-vs-DB property check before the workflow is complete.

## Cleanup Rules

- Remove temporary `.txt` and `.log` files created by this skill before finishing.
- The tracker is local session state and must not be committed.
- The tracker disappears when the worktree is removed during merge cleanup.
