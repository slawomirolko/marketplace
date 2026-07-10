# Olko Implement Current Code Edge Cases

## Configuration Keys

Read these keys from `.agents/skill-config.md`, then `.agents/skills/olko-implement-current-code/project.md`; project adapter wins.

- `branchPrefix`: branch prefix for suggestions and slug derivation. Default: `feature/`.
- `trackerGlob`: tracker file glob. Default: `implement-current-code_*.md`.
- `uses`: explicit skill dependencies. Default: empty.
- `instrumentationPatterns`: strings that count as logging/telemetry. Default: common logger and tracing names.
- `styleCommands`: path-matched style check commands. Default: empty.
- `styleFixCommands`: path-matched auto-fix commands. Default: empty.
- `testCommands`: path-matched test commands. Default: empty.
- `serviceMap`: changed-path to service-name mapping. Default: empty.
- `neverRebuildServices`: services never rebuilt by this skill. Default: common infrastructure service names only when configured by project.
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
- Re-read `## Changed files` before resuming Step 2.
- Verify transferred files still match source before skipping them.
- Preserve tracker failure context until the retried step succeeds.

## Transfer Rules

- The implementation source is the main checkout recorded as `mainRepoPath`.
- Transfer into the created worktree only.
- Do not reimplement from scratch in the worktree.
- Use text writes for normal source files.
- Use native file copy for binary or large files.
- Keep path traversal impossible: relative paths must stay inside both repo roots after resolution.

## Service Rules

- Never rebuild services excluded by `neverRebuildServices`.
- If no service map is configured, skip rebuild and say it is not configured.
- Ask before rebuild, restart, commit, push, PR merge, or cleanup.
- If service health cannot be determined, report that gap instead of assuming success.

## Cleanup Rules

- Remove temporary `.txt` and `.log` files created by this skill before finishing.
- The tracker is local session state and must not be committed.
- The tracker disappears when the worktree is removed during merge cleanup.
