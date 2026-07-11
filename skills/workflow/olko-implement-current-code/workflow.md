# Olko Implement Current Code

## Workflow — follow these steps in order

### Step R — Resume detection

Before starting a fresh run, check whether this is a resume.

1. If the user provided a worktree path, glob for `implement-current-code_*.md` in the worktree root. If exactly one tracker exists, read it and resume from the `CURRENT` step. If multiple exist, ask which one to resume.
2. If the user provided a branch name or slug, derive the slug by stripping any configured branch prefix and preserving hyphens. Look for sibling worktrees named by the repo plus slug and read `implement-current-code_<slug>.md` if present.
3. If the user said resume or continue without a path, run `git worktree list` from the main repo. For every listed worktree, glob for `implement-current-code_*.md`. If exactly one tracker exists, read it. If multiple exist, present them and ask which one to resume.
4. When resuming, set `workdir` to `worktreePath` from the tracker for every later tool call. Re-read `## Changed files` and `## Failure context`. Announce the slug, current step, and worktree path.
5. Do not re-run Steps 0 or 1 when a tracker is found. Jump directly to the `CURRENT` step.

If failure context is non-empty and the current step can be retried, show the context and ask: `Retry Step <N> now, or abort?`

### Step 0 — Collect session-changed files and branch name

1. Load `.agents/skill-config.md` and `.agents/skills/olko-implement-current-code/project.md` if present. Read configuration keys listed in `edge-cases.md`.
2. Collect session-changed files. Prefer the in-session file list if the agent has one. If unavailable, run `git status --short` in the main checkout and ask: `Are these the files to transfer into the worktree? (confirm or adjust)`.
3. Suggest a branch name by analyzing changed paths and recent branch naming conventions. Use configured `branchPrefix`, default `feature/`. Ask: `Suggested branch name: <branch> — accept? (y/n)`. If rejected, ask for the preferred branch name.
4. Check instrumentation in changed files using configured `instrumentationPatterns`. If no logging or telemetry is found and verification requires observability, ask: `No logging/telemetry found in the changed files. Add instrumentation before proceeding? (y/n)`. If yes, add instrumentation following local project patterns, then re-read the changed files.

### Step 1 — Create worktree

1. If `olko-worktree-create` is declared in `uses`, delegate worktree creation with the confirmed branch name. Otherwise, create the worktree manually from the freshly fetched remote default branch.
2. From this point on, run all subsequent reads, edits, checks, and commands inside the worktree path unless explicitly reading source files from `mainRepoPath`.
3. If worktree creation fails or the user aborts, stop.

### Step 1a — Create progress tracker

1. Derive the slug from the branch name by removing the configured `branchPrefix` when present.
2. Create `<worktreePath>/implement-current-code_<slug>.md` using the tracker format in `examples.md`.
3. Fill metadata: `worktreePath`, `branchName`, `mainRepoPath`, `sessionChangedFiles`, `createdAt`, `updatedAt`.
4. Mark Steps 0 and 1 complete. Mark Step 2 as `CURRENT`.
5. Leave `## Changed files`, `## Failure context`, and `## Notes` empty.
6. Ensure `implement-current-code_*.md` is ignored by the worktree. Add it to `.git/info/exclude` by default. If project config allows `.gitignore` edits, add it there instead and do not commit that edit unless the user explicitly asks.
7. Announce the tracker path.

### Step 1b — Tracker update protocol

After every completed step from Step 2 onward:

1. Read the current tracker.
2. Mark the completed step `[x]`.
3. Move `CURRENT` to the next incomplete step.
4. Update `updatedAt` with current UTC time.
5. Update `## Changed files`, `## Failure context`, and `## Notes` when relevant.
6. Write the tracker back.

On failure or abort:

1. Leave the failed step as `CURRENT`.
2. Fill `## Failure context` with the step number, error or blocker, and user decision.
3. Update `updatedAt`.
4. Write the tracker back and stop.

### Step 2 — Transfer session files to worktree

1. Read `sessionChangedFiles` from the tracker.
2. For each file, read the source from `mainRepoPath` and target from `worktreePath`.
3. Ensure the target directory exists.
4. If the file is new or differs, copy the source version into the worktree. Use normal text writes for text files and native file copy for binary or large files.
5. Append each transferred path to `## Changed files` immediately after the transfer succeeds.
6. On resume, verify already-listed files still match source before skipping them.
7. After all files are transferred, run `git status` in the worktree and report the number of transferred files.
8. Update the tracker and move `CURRENT` to Step 3.

### Step 3 — Run style checks

1. If `olko-commit-style` or stack-specific style skills are declared in `uses`, delegate with the transferred file list.
2. Otherwise, run configured `styleCommands` that match the transferred paths.
3. If style violations are found, present the output and ask: `Auto-fix, skip and continue, or abort?`
4. If auto-fix is chosen, run configured `styleFixCommands`, then re-run style checks.
5. Update the tracker and move `CURRENT` to Step 4.

### Step 4 — Run tests

1. If `olko-test` is declared in `uses`, delegate with the transferred file list.
2. Otherwise, run configured `testCommands` that match the transferred paths.
3. If tests fail, follow configured failure handling. Ask whether to fix, skip and continue, or abort.
4. Update the tracker and move `CURRENT` to Step 5.

### Step 5 — Rebuild affected services

1. Determine affected services from configured `serviceMap`. Match changed paths to service names.
2. Remove services listed in `neverRebuildServices`.
3. If no services match, report `No configured services affected` and continue.
4. Present the service list and ask: `Rebuild: <services> — proceed? (y/n)`.
5. For each approved service, run configured build and up commands. Default command templates are documented in `edge-cases.md`.
6. Check configured health command or status command until services are running or timeout.
7. If rebuild or restart fails, report the failing service and ask whether to continue or abort.
8. Update the tracker and move `CURRENT` to Step 6.

### Step 6 — Verify in logs and traces

1. Inspect recent logs for each rebuilt service using configured log commands.
2. Look for errors, warnings, exceptions, connection failures, timeouts, and expected instrumentation keywords.
3. If `lokiUrl` is configured, query logs using configured labels and keywords.
4. If `tempoUrl` is configured, query traces or ask the user to check the configured trace UI when no API query is available.
5. If user action is required to trigger the feature, tell the user the exact action from `verificationActions` and wait for confirmation before re-checking logs.
6. Report:

```text
Verification:
  Service logs: <healthy / errors found>
  Aggregated logs: <found / not found / not configured>
  Traces: <found / not found / not configured>
  Flow completed: <yes / no / partial>
  Issues: <list or "none">
```

7. If issues are found, ask whether to fix the issue, note it and continue, or abort.
8. Update the tracker and move `CURRENT` to Step 7.

### Step 7 — Commit

1. Ask: `Ready for commit? (y/n)`.
2. If no, stop with tracker left at Step 7.
3. If yes and `olko-commit` is declared in `uses`, delegate the commit workflow with the transferred file list and verification summary.
4. If no commit skill is declared, ask the user whether to commit manually using local repository policy.
5. Update the tracker and move `CURRENT` to Step 8.

### Step 8 — Merge worktree to main

1. If `olko-worktree-merge` is declared in `uses`, delegate merge and cleanup.
2. Otherwise, ask the user how to proceed with PR creation, merge, and worktree cleanup.
3. If the user declines merge, stop and leave the worktree intact.
4. After cleanup succeeds, the tracker is removed with the worktree.
