# Olko Implement New

## Workflow — follow these steps in order

### Step R — Resume detection

Before starting a fresh run, check whether this is a resume.

1. If the user provided a worktree path, glob for `implement-new_*.md` in the worktree root. If exactly one tracker exists, read it and resume from the `CURRENT` step. If multiple exist, ask which one to resume.
2. If the user provided a Task ID and no plan path, use the Task ID as the resume slug. Look for sibling worktrees named by the repo plus slug and read `implement-new_<slug>.md` if present.
3. If the user said resume or continue without a path, run `git worktree list` from the main repo. For every listed worktree, glob for `implement-new_*.md`. If exactly one tracker exists, read it. If multiple exist, present them and ask which one to resume.
4. When resuming, set `workdir` to `worktreePath` for every later tool call. Re-read any plan files in `planPaths`, the accepted Task/Feature context, `## Changed files`, and `## Failure context`.
5. Announce: `Resuming olko-implement-new <plan-slug> from Step <N> — <step name> (worktree: <path>).`
6. Do not re-run Steps 0 or 1 when a tracker is found. Jump directly to the `CURRENT` step.

If failure context is non-empty and the current step can be retried, show the context and ask: `Retry Step <N> now, or abort?`

### Step 0 — Resolve Task input and ensure instrumentation

1. Load `.agents/skill-config.md` and `.agents/skills/olko-implement-new/project.md` if present. Read configuration keys listed in `edge-cases.md`.
2. Require the Task-specific implementation plan created in the Feature planning session, plus its accepted Feature context. If the plan is missing, stop implementation and return to Feature planning to create/verify plans for every current child Task together.
3. Resolve `mainRepoPath` from the Git common directory when the session is already in an attached worktree. Read the Task plan from its explicitly supplied location; for configured private plan paths, also check `mainRepoPath` because Git-ignored plans are not copied into a new worktree.
4. Check the input for the observability needed to verify this Task: relevant logs, spans, metrics, events, trace tags, or user-visible status.
5. If instrumentation is missing and verification requires it, add a concise `Instrumentation` requirement to this Task's implementation plan. Do not edit an existing YouTrack issue without separate approval.
6. Report the Task plan path and any instrumentation requirement.

### Step 1 — Resolve implementation worktree

1. Derive a branch name from the Task ID or plan slug using configured `branchPrefix`, default `feature/`.
2. If `olko-worktree-create` is declared in `uses`, delegate worktree resolution with the plan context and branch name. It must reuse the current attached worktree before considering creation. Otherwise, perform the same attached-worktree detection and only create from the freshly fetched remote default branch when the session is in the primary checkout.
3. From this point on, run all subsequent reads, edits, checks, and commands inside the worktree path unless explicitly reading source plan files from `mainRepoPath`.
4. If worktree resolution or creation fails or the user aborts, stop.

### Step 1a — Create progress tracker

1. Derive the run slug from the Task ID when provided; otherwise use the plan filename. For multiple explicitly approved Tasks, join slugs with `+`.
2. Create `<worktreePath>/implement-new_<plan-slug>.md` using the tracker format in `examples.md`.
3. Fill metadata: `taskId`, `featureId`, `planPaths` (the Task plan and linked Feature plan files), `worktreePath`, `branchName`, `mainRepoPath`, `createdAt`, and `updatedAt`.
4. Mark Steps 0 and 1 complete. Mark Step 2 as `CURRENT`.
5. Leave `## Changed files`, `## Failure context`, and `## Notes` empty.
6. Ensure `implement-new_*.md` is ignored by the worktree. Add it to `.git/info/exclude` by default. If project config allows `.gitignore` edits, add it there instead and do not commit that edit unless the user explicitly asks.
7. Copy configured local environment files from `mainRepoPath` to the worktree root, excluding configured template files. Skip silently when none exist.
8. Announce the tracker path and copied environment file count.
9. For a Task under a Feature, create or resume the shared Feature delivery tracker at `<mainRepoPath>/plans/features/<feature-id>/feature-tracker.md`, even when the Feature has one Task. Record Feature acceptance criteria, the base commit before the first Task PR, child Task/PR list, and audit status. Keep this tracker outside the Task implementation plan and preserve it through Task cleanup.

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

### Step 2 — Cross-check Task and Feature inputs

Cross-check the Task implementation plan against its Feature acceptance criteria, decisions, dependencies, parallelism map, and shared tracker. Look for contradictions, missing dependencies, ordering issues, race conditions, schema mismatches, duplicate work, and violations of repo or adapter rules.

Before implementation, the implementation orchestrator must run the short, read-only compatibility preflight against the current code at the Task branch base by calling these existing planning workers in parallel: `olko-investigation-flow-worker`, `olko-investigation-runtime-worker`, `olko-investigation-test-worker`, and `olko-investigation-readiness-worker`. Give each worker the approved Task plan, linked Feature context, and target paths; keep each request within that worker's remit and ask for a compact `PASS`, `PLAN_UPDATE_REQUIRED`, or `BLOCKED` finding with relevant `file:line` evidence. The primary orchestrator and the implementation skill do not replace these worker calls with their own review, and stack auditors are not used for this preflight. Collect all four results before implementation and record them in the Task tracker and shared Feature delivery tracker.

All four `PASS` results are required before Step 3. If this skill is invoked without the implementation orchestrator and its four worker results are not available, stop before editing and return to the orchestrator; do not self-certify. For `PLAN_UPDATE_REQUIRED`, `BLOCKED`, a missing result, or unresolved incompatibility, stop before implementation, report the mismatch and suggested correction, and route material scope/contract changes through Feature impact triage so affected Task plans can be updated together. After the accepted plan changes, rerun all four checks. This preflight does not replace the post-implementation technical audit.

If no critical conflicts are found, report: `Cross-check complete — no critical conflicts detected.`

If critical conflicts are found, present each conflict with affected sources, the specific issue, and a suggested resolution. Ask: `Fix the Task/Feature scope first, implement anyway, or abort?` If the user chooses to fix the scope, return material changes to Feature impact triage and update affected Task plans in the main checkout before repeating Step 2.

Update the tracker and move `CURRENT` to Step 3 only after conflicts are resolved and all four compatibility worker verdicts are `PASS`. Do not treat user acceptance of a known technical incompatibility as a passing preflight.

### Step 3 — Implement

1. Read the Task implementation steps and affected paths from its Task-specific implementation plan.
2. Read each target file inside the worktree before editing.
3. Apply the described changes exactly. If the accepted scope contradicts actual code, stop and report the mismatch instead of silently deviating.
4. Implement the instrumentation requirement from the Task plan using local project patterns.
5. Track every file created or modified. Append each path to `## Changed files` immediately after editing succeeds.
6. On resume, read every listed changed file first. If a file already matches the plan, skip it and continue with remaining work.
7. After the Task is implemented, report the number of changed files and the source used (brief or accepted Task/Feature context).

Update the tracker and move `CURRENT` to Step 4.

### Step 3a — Rules re-check (NEVER skip, MUST run before tests)

> **MANDATORY RULE — re-read ALL applicable project rule docs after implementation, before any test run.**
>
> This step runs unconditionally after Step 3 and before Step 4. There is no skip path.
> Implementation drift is the #1 cause of rule violations that style/test steps cannot catch
> (reflection bans, raw-SQL bans, dependency-direction bans, smart-enum conventions, silent-failure rules).
> The implementer is DUTY-BOUND to verify their own work against the existing docs here — never assume
> "the plan already followed the rules" or "I remembered the rules during implementation."
> NEVER inline the rules into this skill. NEVER summarize them. NEVER paraphrase. ALWAYS open and
> read the actual doc files listed below and audit the diff against their literal text.

1. Discover every applicable rule doc by walking the changed files' stacks. Use the `Read` tool on each:
   - Root: `<repo>/AGENTS.md`
   - Any co-located `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` in the folder of each changed file (walk parents up to repo root).
   - Per-stack rule docs referenced by the project adapter or by the co-located `AGENTS.md` files (e.g. a stack's `AGENTS.md`/`CODING_STYLE.md`/`TESTING.md`). Resolve these paths from the project adapter / skill config — do NOT hardcode a specific repo's layout.
2. For each changed file, audit the diff against the literal text of every doc read in step 1. Do not rely on memory — re-read the doc lines and check each rule against the actual diff lines.
3. If any rule is violated, STOP. Report each violation with: `file:line`, the exact rule text quoted from the doc, and the fix. Do NOT proceed to Step 4 until all violations are fixed or explicitly waived by the user.
4. Ask the user to confirm the rules audit passed before moving on. Do not silently self-certify.

Update the tracker and move `CURRENT` to Step 4.

### Step 4 — Run style checks

1. If `olko-commit-style` or stack-specific style skills are declared in `uses`, delegate with the changed file list.
2. Otherwise, run configured `styleCommands` that match changed paths.
3. If style violations are found, present the output and ask: `Auto-fix, skip and continue, or abort?`
4. If auto-fix is chosen, run configured `styleFixCommands`, then re-run style checks.

Update the tracker and move `CURRENT` to Step 5.

### Step 5 — Run tests

> **CRITICAL RULE — NEVER run tests ad hoc.**
>
> NEVER execute `dotnet test`, `gradlew test`, `pytest`, or any other test runner directly from this skill,
> except the configured `testCommands` fallback below.
> Delegate test execution to `olko-test` whenever it is declared or installed.
> If tempted to run a quick test manually: STOP. Follow the resolution order.

**Delegate to `olko-test` when available.** Resolution (in order):

1. If `olko-test` is declared in `uses` → delegate with the changed file list and plan paths.
2. Else if `.agents/skills/olko-test/` directory exists → auto-delegate (adapter absent, sub-skill installed) with the same arguments.
3. Else, if configured `testCommands` match the changed paths → run them as the fallback and report each command and result.
4. Else → emit `Step 5 (tests): skipped - no olko-test and no matching testCommands` and continue.

`olko-test` maps the changed files to affected test projects and runs **all tests** in those projects (no filter — any affected file might break any test). Shared/contract projects trigger all integration test projects in the repo.

If `olko-test` reports failures, follow its failure handling. Ask whether to fix, skip and continue, or abort.

Update the tracker and move `CURRENT` to Step 6.

### Step 6 — Rebuild affected services (NEVER skip)

> **MANDATORY RULE — service rebuild and log verification are NEVER optional.**
>
> This step MUST always resolve a non-empty set of services to rebuild and Step 7
> MUST always inspect their logs. There is no "no services affected" short-circuit.
> If you cannot resolve services from configuration, auto-discover them from the
> repository Compose file or ask the user — but never silently continue.

1. Determine affected services from configured `serviceMap`. Match changed paths to service names. Remove services listed in `neverRebuildServices` and any `services: []` (e.g. mobile-only stacks with no Docker service).
2. **If no `serviceMap` is configured OR no services matched**, auto-discover instead of skipping:
   1. Find the repository Compose file (`compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`).
   2. Run `docker compose -f <file> config` and read each service's `build.context` / `build.dockerfile`.
   3. A service is affected when a changed path falls under its build context, OR (for monorepos) when the changed path is in a shared library/module that the service compiles. When in doubt about shared-layer blast radius, include the service.
   4. If auto-discovery still yields zero services (e.g. docs-only change, or no Compose file), ASK the user which services to rebuild. Do NOT proceed past this step with an empty set unless the user explicitly confirms there is truly nothing to rebuild.
3. Present the resolved service list and ask: `Rebuild: <services> — proceed? (y/n)`. (This is a confirmation of the list, not an option to skip.)
4. For each approved service, run configured build and up commands. Default command templates are documented in `edge-cases.md`. When the worktree differs from the running stack's checkout, build from the worktree (new code) using the SAME compose project name as the running stack so the rebuilt image replaces the running container without touching the rest of the stack.
5. Check configured health/status command until services are running or timeout.
6. If rebuild or restart fails, report the failing service and ask whether to retry or abort. Do NOT mark this step complete with an unverified failure.

Update the tracker and move `CURRENT` to Step 7.

### Step 7 — Verify in logs, traces, AND database state (NEVER skip)

> **MANDATORY RULE — always inspect logs/traces of every service rebuilt in Step 6 AND verify DB state.**
>
> This step runs unconditionally after Step 6. If Step 6 rebuilt services, their logs
> MUST be inspected here. There is no "N/A" path. If no services were rebuilt (docs-only
> change, explicitly confirmed empty), state that explicitly and why — never silently skip.
>
> **Step 7b (DB verification) is MANDATORY for any plan that mutates persisted state.**
> Logs alone are NOT sufficient. The implementer MUST query the actual DB rows/columns
> and confirm every property/value the plan describes was applied at runtime. If any
> expected value is missing, wrong, or stale, the implementer MUST fix the code and loop
> back to Step 3a. There is no "skip DB check" path when the plan persists data.

#### Step 7a — Verify logs and traces

1. Inspect recent logs for each rebuilt service using configured log commands.
2. Look for errors, warnings, exceptions, connection failures, timeouts, and expected instrumentation keywords (the feature's log/span signatures).
3. If `lokiUrl` is configured, query logs using configured labels and keywords.
4. If `tempoUrl` is configured, query traces or ask the user to check the configured trace UI when no API query is available.
5. If user action is required to trigger the feature, tell the user the exact action from `verificationActions` and wait for confirmation before re-checking logs.
6. **For data-producing changes**, additionally verify the persisted output directly (DB row, queue message, file) — not only logs — to confirm the change took effect at runtime.
7. Report:

```text
Verification:
  Service logs: <healthy / errors found>
  Aggregated logs: <found / not found / not configured>
  Traces: <found / not found / not configured>
  Flow completed: <yes / no / partial>
Issues: <list or "none">
```
8. For a Task under a Feature, append the log/trace evidence to the shared Feature tracker: environment and timestamp, expected positive log/trace signature, scanned time window, and counts/findings for errors, warnings, exceptions, connection failures and timeouts. Mark DB as `PENDING` until Step 7b finishes. Absence of errors without positive evidence that the Task ran is `NOT VERIFIED`.
9. If log/trace issues are found, ask whether to fix the issue, note it and continue, or abort.
10. Do NOT move to Step 8 yet — continue to Step 7b (DB verification) when the Task mutates persisted state.

#### Step 7b — Verify DB state matches the Task contract (MANDATORY for data-mutating Tasks)

> **This sub-step is MANDATORY. It is NOT optional. It is NOT skippable. Logs passing
> is NOT enough. The implementer MUST query the live DB and confirm every property/value
> the plan describes is actually applied at runtime. If any value is wrong, fix and loop
> back to Step 3a.**

1. Re-read every available Task/Feature source (`planPaths`, when present, plus the accepted Task/Feature context). Extract every persisted property/value those sources or the implementation requirements describe:
   - Column names, enum values, computed fields, JSON payloads, foreign keys, denormalized fields.
   - Default values the Task contract specifies (e.g. `algorithmVersion="v2"`, threshold values, config defaults).
   - Migration-introduced columns and their expected population (null vs non-null, backfill state).
   - Path labels, regime cells, posterior group keys — any structured field the plan keys on.
   - Diagnostic fields the sources say to populate (e.g. reason/state/telemetry-counter fields they name).
2. Determine connection: read `dbConnectionString` (or `dbConnectionSettings`) from `.agents/skill-config.md` then `.agents/skills/olko-implement-new/project.md`; project adapter wins. If absent, ask the user for the connection string. Never guess.
3. Determine query method: prefer EF Core LINQ / a configured CLI / a psql/sqlcmd wrapper from `dbQueryCommand` in skill config. If raw SQL is the only path, use read-only `SELECT` queries ONLY — never INSERT/UPDATE/DELETE from this step (the feature itself must do the writes; this step only verifies). Raw SELECT is allowed here despite repo raw-SQL bans because this is verification-only, read-only, and does not touch application code.
4. For each extracted property/value, write and run a verification query that confirms the runtime DB state matches the Task contract. Cover at minimum:
   - **Schema check**: new columns/tables exist (query `information_schema.columns` / `information_schema.tables` for the relevant DB). Report any missing schema element as a violation.
   - **Population check**: rows affected by the recent run have the expected values (e.g. a versioned column equals the plan-specified version, a timestamp column matches the source snapshot's timestamp, a state column is non-null when its prerequisite input is available).
   - **Default check**: config-defaulted values match plan-specified defaults (e.g. `algorithmVersion` setting equals `"v2"` after the bump).
   - **Diagnostic-field check**: fields the plan says to populate are actually populated in the latest run's rows.
5. Trigger the feature once (using `verificationActions`) if the change is not already triggered by the rebuilt service's normal cycle, so the DB has fresh rows to verify. Wait for the cycle to complete before querying.
6. Build a verification matrix and report it:

```text
DB Verification Matrix (plan vs runtime):
  [PASS] <plan-property> → <expected> == <actual-DB-value> (row: <id-or-key>)
  [FAIL] <plan-property> → expected <expected>, got <actual-DB-value> (row: <id-or-key>)
  [MISSING] <plan-property> → column/table not found in schema
  Summary: <N pass, <M fail, <K missing>
```

   For a Task under a Feature, immediately update its shared tracker
row with the matrix verdict, including `FAIL` before any fix loop. Use `N/A`
only when the plan does not mutate persisted state.

7. **MANDATORY fix-and-loop gate**:
   - If ANY row in the matrix is `[FAIL]` or `[MISSING]`, this is a hard failure. Do NOT proceed to Step 8.
   - STOP. Report every failing row with: the plan section that specified the property, the file:line that should have written it, the actual DB value, and the discrepancy.
   - Fix the code in the worktree to make the DB state match the plan.
   - After fixing, **loop back to Step 3a** (rules re-check) — re-run the full 3a → 4 → 5 → 6 → 7a → 7b loop. The loop MUST go through 3a, NOT straight back to 7b. Edits that fix DB state can introduce rule violations, style drift, or test regressions, so the full gate re-runs.
   - Repeat until the DB Verification Matrix has zero `[FAIL]` and zero `[MISSING]` rows.
8. Only after the matrix is fully green (all `[PASS]`, zero `[FAIL]`, zero `[MISSING]`) is Step 7b complete.
9. Update the shared Feature tracker with the final DB result (`PASS`, `FAIL`, or `N/A`) and set the Task runtime verdict to `PASS` only when all required positive log/trace and DB evidence passes. Otherwise record `FAIL` or `NOT VERIFIED` with the missing evidence.
10. Report the final matrix and:

```text
Step 7 summary:
  Logs/traces: <healthy / issues>
  DB verification: <all green / N fixed and re-verified>
  Loops back to 3a: <count>
  Flow completed: <yes / no / partial>
  Issues remaining: <list or "none">
```

Update the tracker and move `CURRENT` to Step 8 ONLY after both 7a and 7b pass.

### Step 7c — Task technical audit (MANDATORY for every Task PR)

Before commit or PR creation, run every applicable stack auditor against the
actual Task diff: `olko-dotnet-auditor`, `olko-mobile-auditor`, and/or
`olko-army-python-auditor`. Give each auditor the Task ID, owning Feature ID and
acceptance criteria, Task plan, linked Feature plan, changed paths, and diff.
Require a read-only
review of architecture, project conventions, correctness, tests, and whether
the Task is independently safe to merge. Record the auditor, exact scope,
verdict, and `file:line` findings in both the Task tracker and the shared
Feature delivery tracker.

Any correctness, architecture, or safety finding blocks PR delivery until
fixed and re-audited. Do not waive those findings. Record non-blocking
suggestions separately. After a fix, rerun affected rules/style/tests/runtime
checks and the affected auditor. This gate is per Task; do not run the combined
Feature audit here.
For work without an owning Feature, record the Task audit in the local tracker
and omit the shared Feature tracker.

Update the tracker and proceed to Step 8 only after the applicable Task audit
passes.

### Step 8 — Commit

1. Ask: `Ready for commit? (y/n)`.
2. If no, stop with tracker left at Step 8.
3. If yes and `olko-commit` is declared in `uses`, delegate the commit workflow with changed files, Task/Feature IDs, plan paths, and verification summary.
4. If no commit skill is declared, ask the user whether to commit manually using local repository policy.

Update the tracker and move `CURRENT` to Step 8a.

### Step 8a — Wait for opencode review comment (MANDATORY before merge)

> **MANDATORY RULE — never merge a PR without first reading the opencode review comment.**
>
> This step runs unconditionally after Step 8 and before Step 9. There is no skip path.
> The opencode bot reviews every PR; its comment may contain actionable findings
> (bugs, style violations, missing tests, plan mismatches). Merging without reading it
> risks shipping known defects. The implementer is DUTY-BOUND to wait for the comment,
> read its full details, and resolve or explicitly waive every finding before merge.

1. Resolve the PR number for the current branch:
   ```bash
   gh pr view --json number,url --jq '{number: .number, url: .url}'
   ```
   If no PR exists, report that and ask the user how to proceed (open one, or abort).
2. Poll for the opencode review comment. The comment is posted by the opencode bot
   (author login contains `opencode`). Poll every 30–60 seconds:
   ```bash
   gh pr view <prNumber> --json comments,reviews --jq '{comments: [.comments[] | {author: .author.login, body: .body}], reviews: [.reviews[] | {author: .author.login, state: .state, body: .body}]}'
   gh api repos/{owner}/{repo}/pulls/<prNumber>/comments --jq '[.[] | {author: .user.login, path: .path, line: .line, body: .body}]'
   gh api repos/{owner}/{repo}/issues/<prNumber>/comments --jq '[.[] | select(.user.login | contains("opencode")) | .body]'
   ```
   Stop polling when an opencode comment is found. If the user confirms the bot will not
   comment (e.g. bot disabled), record that confirmation and continue.
3. **ALWAYS read the full details of the opencode comment** — never skim, never skip.
   Extract every concrete finding: file paths, line references, requested changes,
   and the exact quoted text. Do not rely on memory or a summary.
4. Present the findings to the user and ask:
   ```text
   opencode review comment received:
   <full details>

   How to proceed?
   1. Address all findings
   2. Address specific findings
   3. Merge as-is (waive)
   4. Abort
   ```
5. For option 1 or 2, apply the requested changes in the worktree, then loop back to
   **Step 3a** (rules re-check) and re-run 3a → 4 → 5 → 6 → 7a → 7b → 8 → 8a. Edits that
   address review findings can introduce rule/style/test regressions, so the full gate
   re-runs. Do NOT loop straight back to 8a.
6. For option 3, record the waiver in the tracker Notes and continue to Step 9.
7. For option 4, stop.

Update the tracker and move `CURRENT` to Step 9.

### Step 9 — Merge worktree to main

1. If `olko-worktree-merge` is declared in `uses`, delegate merge and cleanup.
2. Otherwise, ask the user how to proceed with PR creation, merge, and worktree cleanup.
3. If the user declines merge, stop and leave the worktree intact.
4. After cleanup succeeds, continue from the main checkout.

Update the tracker and move `CURRENT` to Step 10 if the tracker still exists.

### Step 10 — Identify the Task implementation plan for cleanup

1. If the Task PR was merged, record the exact Task implementation plan path for removal after post-merge verification.
2. Never select a Feature plan, `feature-tracker.md`, another Task's plan, or a containing directory. Do not delete anything in this step.
3. If plan ownership is ambiguous, record `NOT IDENTIFIED`, retain it, and report the ambiguity.
4. If the PR was not merged, retain the Task implementation plan.
5. Remove temporary `.txt` and `.log` files created by this skill.

### Step 11 — Rebuild from main, verify, then remove only the Task implementation plan (NEVER skip)

> **MANDATORY RULE — after merge, the running stack MUST be rebuilt from main and verified.**
>
> This step runs unconditionally after Step 10 if the PR was merged in Step 9.
> If the user declined merge or left the PR open in Step 9, state that explicitly
> and skip. There is no other skip path.

1. Only runs if the PR was merged to main in Step 9. If merge was declined or the PR was left open, announce: `Step 11 (post-merge rebuild): skipped — PR not merged` and stop.
2. Ensure `workdir` is `mainRepoPath`. If the worktree was removed in Step 9, this should already be the case. Run `git rev-parse --abbrev-ref HEAD` to confirm the current branch is `main`/`master`.
3. Pull the latest main if not already up to date: `git pull --ff-only origin main`.
4. Resolve affected services using the same method as Step 6:
   - If `serviceMap` is configured, match changed paths to service names. Derive changed paths from the squash merge commit: `git diff HEAD~1..HEAD --name-only`.
   - If no `serviceMap` is configured, auto-discover from the repository Compose file as in Step 6.
   - Remove services listed in `neverRebuildServices` and any `services: []`.
   - If zero services resolved, ASK the user which services to rebuild. Do not skip.
5. Present the resolved service list and ask: `Rebuild from main: <services> — proceed? (y/n)`.
6. For each approved service, run configured `composeBuildTemplate` and `composeUpTemplate` from the main checkout using the SAME compose project name as the running stack.
7. Check configured `composeStatusCommand` until services are running or timeout.
8. Inspect recent logs for each rebuilt service using configured `logCommands`. Look for errors, warnings, exceptions, connection failures, timeouts, and expected instrumentation keywords.
9. If `lokiUrl` is configured, query logs using configured labels and keywords.
10. If `tempoUrl` is configured, query traces or ask the user to check the configured trace UI.
11. If user action is required to trigger the feature, tell the user the exact action from `verificationActions` and wait for confirmation before re-checking logs.
12. For data-producing changes, verify the persisted output directly (DB row, queue message, file) — not only logs.
13. **MANDATORY post-merge DB verification** — re-run Step 7b's DB Verification Matrix against the post-merge stack. Read the same Task/Feature plan files and the same extracted persisted properties. Query the live DB with the same `dbConnectionString` / `dbQueryCommand`. Build the same `[PASS]/[FAIL]/[MISSING]` matrix. The post-merge stack MUST satisfy the same plan-vs-DB property check.
14. Report:

```text
Post-merge verification:
  Service logs: <healthy / errors found>
  Aggregated logs: <found / not found / not configured>
  Traces: <found / not found / not configured>
  DB verification: <all green / N fail / M missing>
  Flow completed: <yes / no / partial>
  Issues: <list or "none">
```

15. If DB verification has any `[FAIL]` or `[MISSING]` row, the post-merge stack is NOT verified. Report the failing rows with the plan section + file:line that should have written them. Ask whether to fix (back to a fresh Step 3 implementation cycle from the main checkout), note and continue, or abort. Do NOT declare success with failing DB rows. Retain the Task implementation plan while verification is failing.
16. After post-merge verification passes, delete only the exact Task implementation plan recorded in Step 10. Preserve the shared `feature-tracker.md`, Feature-level plans, sibling Task plans, and containing directories. Do not delete a directory recursively. If Step 10 recorded `NOT IDENTIFIED`, retain the ambiguous file and report why. This cleanup is part of the requested flow; do not ask for a second approval.

### Step 11a — Final Feature technical audit (MANDATORY, once after the last Task)

After Step 11, read the owning Feature and all child Tasks from YouTrack and the
shared Feature delivery tracker. Run this gate only after every child Task PR
has merged and every Task has a passing Step 7c audit and post-merge
verification. Otherwise record `FEATURE_AUDIT_PENDING`, list the missing Task
IDs/evidence, and stop without marking the Feature complete.

Use the recorded Task PR merge commits to define the cumulative Feature diff;
use `base..HEAD` only when it contains no unrelated mainline changes. Run each
applicable stack auditor once on that combined diff and the full Feature
acceptance criteria. Focus on
cross-Task integration, shared contracts/domain models, regressions, Feature
completeness, and end-to-end acceptance; do not repeat the already-passed
individual Task audits. Also verify the Feature's end-to-end runtime behavior
and inspect its logs, traces, and persisted state where applicable.

Record the base/final commits, auditors, cumulative scope, acceptance/runtime
evidence, findings, and final `PASS` / `FAIL` in the shared Feature tracker.
Only `PASS` permits Feature completion. On `FAIL`, identify affected Task(s),
route any corrective backlog change through the approved Epic/Feature/Task
workflow, deliver correction as its own Task PR through Step 7c, and rerun this
Feature audit after that PR merges. Keep the shared tracker until this gate
passes; Task plan cleanup must not delete it.
