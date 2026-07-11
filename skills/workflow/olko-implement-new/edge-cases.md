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
- `testCommands`: path-matched test commands. Default: empty.
- `serviceMap`: changed-path to service-name mapping. Default: empty.
- `neverRebuildServices`: services never rebuilt by this skill. Default: empty.
- `composeBuildTemplate`: service build command template. Default: `docker compose build {service}`.
- `composeUpTemplate`: service start command template. Default: `docker compose up -d {service}`.
- `composeStatusCommand`: service status command. Default: `docker compose ps`.
- `logCommands`: service log commands. Default: compose recent logs when compose is configured.
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

## Service Rules

- Never rebuild services excluded by `neverRebuildServices`.
- If no service map is configured, skip rebuild and say it is not configured.
- Ask before rebuild, restart, commit, push, PR merge, cleanup, or plan deletion.
- If service health cannot be determined, report that gap instead of assuming success.

## Cleanup Rules

- Remove temporary `.txt` and `.log` files created by this skill before finishing.
- The tracker is local session state and must not be committed.
- The tracker disappears when the worktree is removed during merge cleanup.
