# Feature Plan Workflow

## Contract

For one accepted Feature, complete the Feature plan pair, `stack.md`, `tracker.md`, and a technical plan for every current child Task in one session. Do not implement code, run shell commands, commit, push, or change agent/model configuration. Resume from `tracker.md`; preserve unaffected Task plans.

The package is `plans/features/<feature-id>/`: exactly `business.md`, `implementation.md`, `stack.md`, `tracker.md`, plus `tasks/<task-id>-implementation.md` for each child. Feature plan owns business outcome, rollout, integration, cross-task dependencies, and shared decisions. Task plans own one Task/PR, paths, implementation and verification contract.

Never use shadow runs, A/B, dual runs, default-off gates for a new mechanism, or switch-on-later deployment. Replace superseded production paths in the same change.

## Ordered workflow

1. Resolve Feature/Task scope from the issue and supplied plans. Obtain current issue context from `olko-feature-backlog-writer` in read-only context mode. Ask `olko-obsidian-knowledge-manager` for relevant knowledge context and proposals only; do not edit the vault.
2. In parallel, obtain business draft and evidence from flow, runtime, test, and readiness workers. Only the business writer edits `business.md`. Use verified findings to create/update `implementation.md` and one Task plan per current child via `olko-plan-editor`.
3. Build `stack.md` from verified implementation scope. Use only `Design patterns`, `Technology stack`, and `Dependencies`, each with `Existing`/`New` subsections as needed. Check manifests/config before classifying dependencies; record evidence in `tracker.md`.
4. After every plan-editor invocation, run a bidirectional consistency gate: every business goal/scope/risk/AC has implementation, verification, or justified exclusion; every technical change supports business scope; `stack.md`, Task issues, estimates, dependencies, and parallelism agree. Correct via `olko-plan-editor` and repeat until clean.
5. Run read-only stack auditors only for stacks in scope: .NET, Android/Kotlin, React, React Native, Army Python. For each Task, audit only evidence justified by its material risk. No Feature-wide implementation audit during a single-Task planning cycle.
6. Run `olko-review-orchestrator` PLAN ROUTE once for Feature `implementation.md` and once per Task plan. Fold confirmed findings, then rerun consistency. Record review results in `tracker.md`; rerun review for any plan file changed later.
7. Collect every answerable grill/blocker question across Feature and Tasks into one batch. Record it in `tracker.md`; keep plans unchanged until all answers/follow-ups are closed. Apply all answers together, then perform one complete revalidation cycle: relevant readiness/investigation workers, relevant stack auditors, bidirectional consistency + stack refresh, and plan-editor corrections. Repeat until a pass yields no new findings. Never claim readiness after a skipped/partial cycle.
8. Load `grill-with-docs` with business, technical, stack plans, consistency/readiness evidence, and accepted exceptions. Continue only after it confirms closure and the final pair passes consistency. If a material Task boundary changes, run `olko-plan-change-triage`.
9. After explicit grill approval, remove rejected/speculative alternatives only after confirming approved replacement is concrete. Keep scope, sequence, acceptance, verification, and blockers. Refresh `stack.md` and rerun consistency.
10. **Acceptance-to-E2E matrix gate — mandatory before readiness/finalization, every current Task:**
     - Delegate each Task to `olko-e2e-matrix-author` with current issue AC, approved Task plan, Feature context, and manifest path. It maps every criterion to an executable scenario/check with an expected result and evidence, writes `<e2eManifestDir>/<task-id>.acceptance.json` (default `tests/e2e`, resolved from the project adapter), and returns criterion table for folding into the Task plan.
    - Author delegates validation-only to `olko-e2e-acceptance-runner`, passing exact Task AC IDs. Runner is sole validator. Require `PASS` for exact current AC set and manifest.
    - Missing/ambiguous AC, missing mapping, runner unavailable/result missing, `FAIL`, or `NOT VERIFIED` means Task `Ready for implementation: no`; record blocker in Task plan and tracker. Correct and rerun same chain. Any later AC/plan/scenario/manifest change invalidates PASS.
    - This is validation only. Baseline, implementation recheck, and post-merge execution belong to the implementation workflow.
11. Set Task readiness `yes` only if architecture, dependencies, instrumentation, runtime verification, and error handling are ready (or explicitly excepted) AND current runner PASS exists AND no blocking items remain. Set Feature readiness `yes` only if every current Task is ready, all four shared Feature files and every Task plan exist, and zero unresolved/open blockers remain. `VERIFY-DURING-WORK` may remain only if it cannot change what is built; `ACCEPTED-GAP` needs explicit user acceptance recorded in tracker.
12. If readiness is `no`, batch all answerable blockers; resolve via user decision, revalidate complete package, and repeat. Never silently drop or defer a blocker. If decisions alter scope, run impact triage.
13. Load `olko-plan-finalization` for its final steps and completion report. Memory persistence is required. Do not change Obsidian during planning.

## Tracker and issue rules

- Record evidence, question batches, answers/closure, workers, auditors, consistency and readiness in `tracker.md`; update after each stage.
- Existing issue changes require a read-only draft from `olko-feature-backlog-writer`, exact diff, and separate explicit user approval immediately before publishing. A grill answer/plan approval does not authorize issue edits. Revalidate affected plans after approved scope changes.
- For each Task keep one PR, evidence-backed file list, implementation/test/runtime checks, dependencies, parallel group, and independent merge safety. Default path budget 5–15 counted code paths; follow explicit approved extension; otherwise split/narrow before readiness.
- Discovery/backlog path is separate and does not produce implementation readiness.
