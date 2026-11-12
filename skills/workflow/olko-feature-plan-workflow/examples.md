# Feature Plan Workflow — Examples

## Example 1 — plan an accepted Feature

Input: Feature issue ID with three child Tasks, each with acceptance criteria.

1. Read issue context read-only through `olko-feature-backlog-writer`; ask `olko-obsidian-knowledge-manager` for knowledge context and proposals only.
2. Create `business.md` (writer) and `implementation.md` (plan editor) plus one `tasks/<task-id>-implementation.md` per child, in the same session.
3. Build `stack.md` from verified scope; classify each dependency by reading manifests and configuration.
4. Run the bidirectional consistency gate, then stack auditors only for stacks the plan actually implements.
5. Run `olko-review-orchestrator` PLAN ROUTE per plan file; fold confirmed findings and rerun consistency.
6. Batch every open question, close the whole batch, run one revalidation cycle, then one E2E matrix per Task.
7. Load `olko-plan-finalization` for the completion report.

## Example 2 — resume after a scope change

An approved decision changes one Task boundary. Re-read `tracker.md`, run `olko-plan-change-triage`, revise the Feature rollout and every affected Task plan, rerun consistency and review for the changed files, and refresh readiness. Do not reopen closed questions and do not re-plan unaffected Tasks.

## Example 3 — Epic-only plan

`stack.md` and Task files do not apply. Produce the linked business/technical pair for the Epic, run the same consistency and review gates, and stop before any Task-level readiness verdict.
