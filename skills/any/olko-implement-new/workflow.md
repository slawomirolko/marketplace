# Olko Implement New

## Workflow — follow these steps in order

### Step R — Resume detection

Before starting a fresh run, check whether this is a resume.

1. If the user provided a worktree path, glob for `implement-new_*.md` in the worktree root. If exactly one tracker exists, read it and resume from the `CURRENT` step. If multiple exist, ask which one to resume.
2. If the user provided a plan path or plan name, derive the plan slug from the filename without `.md`. Look for sibling worktrees named by the repo plus slug and read `implement-new_<slug>.md` if present.
3. If the user said resume or continue without a path, run `git worktree list` from the main repo. For every listed worktree, glob for `implement-new_*.md`. If exactly one tracker exists, read it. If multiple exist, present them and ask which one to resume.
4. When resuming, set `workdir` to `worktreePath` from the tracker for every later tool call. Re-read plan files from `planPaths`, re-read `## Changed files`, and review `## Failure context`.
5. Announce: `Resuming olko-implement-new <plan-slug> from Step <N> — <step name> (worktree: <path>).`
6. Do not re-run Steps 0 or 1 when a tracker is found. Jump directly to the `CURRENT` step.

If failure context is non-empty and the current step can be retried, show the context and ask: `Retry Step <N> now, or abort?`

### Step 0 — Read plans and ensure instrumentation

1. Load `.agents/skill-config.md` and `.agents/skills/olko-implement-new/project.md` if present. Read configuration keys listed in `edge-cases.md`.
2. Resolve every plan path. If a user gives a plan name without path, first check configured `planDirectory`, then ask if still missing.
3. Read every plan file in the main checkout. Plans are canonical in the main checkout until the worktree is created.
4. For each plan, check whether it describes observability instrumentation: log calls, spans, metrics, events, trace tags, or other project-configured signals.
5. If instrumentation is missing and verification requires observability, add a brief `Instrumentation` section to the plan. Include files, signal names, key points, and existing local patterns to follow.
6. Report one summary line per updated plan. If all plans already describe instrumentation, report that and continue.

### Step 1 — Create worktree

1. Derive a branch name from the plan slug using configured `branchPrefix`, default `feature/`.
2. If `olko-worktree-create` is declared in `uses`, delegate worktree creation with the plan context and branch name. Otherwise, create the worktree manually from the freshly fetched remote default branch.
3. From this point on, run all subsequent reads, edits, checks, and commands inside the worktree path unless explicitly reading source plan files from `mainRepoPath`.
4. If worktree creation fails or the user aborts, stop.

### Step 1a — Create progress tracker

1. Derive the plan slug from plan filenames. For multiple plans, join slugs with `+`.
2. Create `<worktreePath>/implement-new_<plan-slug>.md` using the tracker format in `examples.md`.
3. Fill metadata: `planPaths`, `worktreePath`, `branchName`, `mainRepoPath`, `createdAt`, `updatedAt`.
4. Mark Steps 0 and 1 complete. Mark Step 2 as `CURRENT`.
5. Leave `## Changed files`, `## Failure context`, and `## Notes` empty.
6. Ensure `implement-new_*.md` is ignored by the worktree. Add it to `.git/info/exclude` by default. If project config allows `.gitignore` edits, add it there instead and do not commit that edit unless the user explicitly asks.
7. Copy configured local environment files from `mainRepoPath` to the worktree root, excluding configured template files. Skip silently when none exist.
8. Announce the tracker path and copied environment file count.

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

### Step 2 — Cross-check plans

Read all plans together before editing code. Look for contradictions, missing dependencies, ordering issues, race conditions, schema mismatches, duplicate work, and violations of repo or adapter rules.

If no critical conflicts are found, report: `Cross-check complete — no critical conflicts detected.`

If critical conflicts are found, present each conflict with affected plans, the specific issue, and a suggested resolution. Ask: `Fix the plans first, implement anyway, or abort?` If the user chooses to fix plans, update the plan files in the main checkout and repeat Step 2.

Update the tracker and move `CURRENT` to Step 3 only after conflicts are resolved or explicitly accepted.

### Step 3 — Implement

1. Read each plan's files-to-change section and implementation steps.
2. Read each target file inside the worktree before editing.
3. Apply the described changes exactly. If the plan contradicts actual code, stop and report the mismatch instead of silently deviating.
4. Implement the plan's instrumentation section using local project patterns.
5. Track every file created or modified. Append each path to `## Changed files` immediately after editing succeeds.
6. On resume, read every listed changed file first. If a file already matches the plan, skip it and continue with remaining work.
7. After all plans are implemented, report the number of changed files and plans.

Update the tracker and move `CURRENT` to Step 4.

### Step 4 — Run style checks

1. If `olko-commit-style` or stack-specific style skills are declared in `uses`, delegate with the changed file list.
2. Otherwise, run configured `styleCommands` that match changed paths.
3. If style violations are found, present the output and ask: `Auto-fix, skip and continue, or abort?`
4. If auto-fix is chosen, run configured `styleFixCommands`, then re-run style checks.

Update the tracker and move `CURRENT` to Step 5.

### Step 5 — Run tests

1. If `olko-test` is declared in `uses`, delegate with changed files and plan paths.
2. Otherwise, run configured `testCommands` that match changed paths and plan test sections.
3. If tests fail, follow configured failure handling. Ask whether to fix, skip and continue, or abort.

Update the tracker and move `CURRENT` to Step 6.

### Step 6 — Rebuild affected services

1. Determine affected services from configured `serviceMap`. Match changed paths to service names.
2. Remove services listed in `neverRebuildServices`.
3. If no services match, report `No configured services affected` and continue.
4. Present the service list and ask: `Rebuild: <services> — proceed? (y/n)`.
5. For each approved service, run configured build and up commands. Default command templates are documented in `edge-cases.md`.
6. Check configured health command or status command until services are running or timeout.
7. If rebuild or restart fails, report the failing service and ask whether to continue or abort.

Update the tracker and move `CURRENT` to Step 7.

### Step 7 — Verify in logs and traces

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

Update the tracker and move `CURRENT` to Step 8.

### Step 8 — Commit

1. Ask: `Ready for commit? (y/n)`.
2. If no, stop with tracker left at Step 8.
3. If yes and `olko-commit` is declared in `uses`, delegate the commit workflow with changed files, plan paths, and verification summary.
4. If no commit skill is declared, ask the user whether to commit manually using local repository policy.

Update the tracker and move `CURRENT` to Step 9.

### Step 9 — Merge worktree to main

1. If `olko-worktree-merge` is declared in `uses`, delegate merge and cleanup.
2. Otherwise, ask the user how to proceed with PR creation, merge, and worktree cleanup.
3. If the user declines merge, stop and leave the worktree intact.
4. After cleanup succeeds, continue from the main checkout.

Update the tracker and move `CURRENT` to Step 10 if the tracker still exists.

### Step 10 — Remove plans

1. Ask before deleting plan files.
2. If approved, remove each input plan file from the main checkout.
3. Remove temporary `.txt` and `.log` files created by this skill.
4. Report removed plan count and final status.
