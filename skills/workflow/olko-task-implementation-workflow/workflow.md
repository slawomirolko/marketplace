# Task Implementation Workflow

## Hard rules

- No new shadow/A-B/dual mechanism or default-off production gate. Replace old path in the same change; rollback is revert.
- Never ask for or accept explanatory code comments, or AC/plan/PR references in code/tests.
- Never create/change CI workflows without explicit in-session approval naming the workflow.
- During worktree steps 1–10, never touch main Compose. Use isolated project/DB/identities; load `olko-worktree-compose-isolation`.
- Do not load `olko-implement-new`. Do not edit code/config or run shell directly; delegate to allowed stack agents. Only primary delegates.
- Do not create/change agent definitions, installed skills, or model config as part of a Task implementation. Update only approved Task code/config and its journal, except where the user explicitly authorizes those workflow changes.

## Entry and preparation

Start only from existing YouTrack Task with AC and approved Task plan. Read owning Feature plan and shared delivery tracker. Missing input → `olko-plan-documentation-orchestrator`. If changes already exist, follow the Adoption section below. Never overwrite adopted paths.

At start, dispatch `olko-marketplace-skill-bootstrapper` alongside independent discovery; wait before dispatching children needing newly installed skills. Create/resume shared Feature delivery tracker before first Task. Load/update Task `## Implementation` journal after every stage, failure, progress update, delegation, decision, delivery, or verification; resume from journal before other work.

Split work into exclusive, small chunks by mechanism/file and stack. Investigate/audit independent scopes in parallel; no overlapping file ownership. Never give a child the whole plan. Assign stack-specific implementers/test runners only from `permission.task`; child delegation is forbidden. Never assign two editing agents the same file, migration, test fixture, generated artifact, or shared configuration; overlapping scopes run in order and the first result passes to the next agent. Log each chunk before dispatching next.

## Adoption

If requested changes already exist, load `olko-implement-current-code` for intake, Task-scope checks, and safe transfer only. Require the approved Task plan for this Task, its owning Feature, and a counted code-path total of the EXISTING diff within the path budget (`olko-task-scope-gates`) — count it at adoption, before any handoff, never only at the pre-delivery gate. After handoff, reuse the diff; never assign an implementer to overwrite those paths. If intake blocks, return to `olko-plan-documentation-orchestrator` or Task-impact review.

## Blocked decisions and the decision store

A child that returns `Blocked:` never chooses a new dependency or a new project convention alone; it returns 2–3 options and finishes the unblocked part.

- Present the open question with the child's options and examples verbatim, one question at a time, recommendation first. Use the project's configured question channel: `grill-with-docs` when the orchestrator carries a USER QUESTION GATE, otherwise the `question` tool when available.
- Re-dispatch the blocked part with the user's decision.
- After the decision, PROPOSE where to persist it so the same stop does not repeat: a new ADR in `adrDirectory`, a new or updated rule file in `rulesDirectory` (with its row in `README.md`), or an `AGENTS.md` entry — or name the existing entry to refresh. Apply the ADR filter: only a decision that is hard to reverse, surprising without context, and the result of a real trade-off earns an ADR. Write only after the user approves the exact text. Use `<adrDirectory>/TEMPLATE.md` and `<adrDirectory>/README.md` when present; otherwise write a short ADR and suggest running `olko-init-project-docs`.
- A contradiction between `AGENTS.md` and a store entry is itself a `Blocked:` item: ask which one holds, then propose the fix to the other.

## Ordered gates

1. Delegate worktree creation/resume to `olko-worktree-lifecycle-manager`.
2. **Baseline E2E:** require approved Task matrix/manifest; if missing, stop and return to planning E2E MATRIX GATE. Never author/invent mappings here. Delegate `baseline` to `olko-e2e-acceptance-runner` in isolated environment; the runner reads current Task AC from YouTrack, passes every exact ID to the CLI, and blocks on missing/extra mappings. Save criterion-level report in plan. Missing mapping or unavailable environment blocks implementation.
3. **Compatibility preflight:** before any implementer, run flow/runtime/test/readiness workers in parallel at worktree base. Require four `PASS` results with `file:line` evidence; missing result, `PLAN_UPDATE_REQUIRED`, `BLOCKED`, or incompatibility blocks implementation and routes material plan edits through impact triage.
4. **Failing tests first:** when Task adds tests, `olko-test-first-author` writes one failing test per AC per relevant stack. Resolve disputes with author; if disagreement persists after author justifies test, ask user. Edge-case loop runs once. Never let children alter these tests.
5. Delegate exclusive implementation chunks. Preserve current behavior outside scope and production validity. Resolve child blockers by presenting options/recommendation; no child may choose new dependencies/conventions.
6. Delegate style and affected tests. Run E2E `implementation` recheck from same manifest against the current Task AC IDs; every criterion must pass against baseline. Missing tools/credentials/screenshots/cleanup never justify skipping.
7. Rebuild only isolated worktree services. Record isolation proof. Collect positive runtime/log/trace/DB evidence in isolated project, including environment/time, signature, scan window, and warnings/errors. No positive execution evidence = NOT VERIFIED.
8. For changed agent-context files, load configured `agentsOptimizerSkill` (default `olko-agents-optimizer`) and follow its complete phases. If unavailable/not allowed, stop and report. Record before/after counts in journal.
9. Load `olko-task-scope-gates`; enforce Task-to-PR scope and path budget before delivery. More than 15 counted paths blocks unless explicit developer extension applies.
10. Delegate `olko-review-orchestrator` REVIEW ROUTE before PR delivery. Block on bug/security/requirements/merge-safety findings; fix, rerun affected checks, and re-review. Project-rule violations/`ask` verdict require user decision. Never run Feature-wide audit here. A gap the review exposes OUTSIDE this Task's scope is never a new Task you create: load `olko-task-scope-gates` and follow its GAP OUTSIDE THE TASK SCOPE procedure.
11. Commit/PR delivery only after explicit user confirmation via `olko-git-delivery-manager`. After PR opens, load `olko-pr-check`; report current CI/review findings and ask “Fix which findings?” before changes. No automatic fixes, merge, or resolution.
12. After PR green, complete Obsidian knowledge gate and editor verification via `olko-implementation-pr-gates`; do not merge while either is incomplete/declined.
13. Merge only after explicit user confirmation via `olko-worktree-lifecycle-manager` (`merge-retain`). Keep Task worktree/plan. Run mandatory post-merge E2E and upload evidence before cleanup; failure retains worktree. Then post-merge runtime, then the final Feature audit and Feature plan-file question when this is the last Task, and only then cleanup — with the session relocated out of the worktree before the worktree is removed. All post-merge stages run through `olko-implementation-closure`.

## Agent and verification constraints

- Use `olko-dotnet-*`, `olko-army-python-*`, `olko-mobile-*`, `olko-react-*`, or `olko-react-native-*` agents matching stack. `olko-test` is a skill, not a task agent. Never invent agent names.
- If any Kotlin mobile file changes, full `:app:connectedDebugAndroidTest` suite on the project's compose-defined Android emulator is mandatory; no class filters. Missing emulator is a blocker unless user explicitly waives.
- Maintain one shared Feature tracker through the final Feature audit; its path comes from the project adapter (default `plans/features/<feature-id>/feature-tracker.md`). Task plan stays under `tasks/`; do not create per-Task business/stack/tracker sets or `implement-new` files.
- After merge E2E and runtime pass, clean disposable worktree. Never delete plan/Feature tracker without the closure gate and required user approval.
