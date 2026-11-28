---
name: olko-marketplace-upstream
version: 1.1.0
description: Send one local change to an installed marketplace skill or agent back to the marketplace as a draft PR. Stage the change without the project adapter, keep project-specific hunks out, optimize the staged copy, and publish a draft PR that only a person merges or closes. Also resolves the conflicts of a prepared marketplace merge in its work directory. Use when the factory marketplace-upstream watch, the marketplace merge workflow, or the person asks to upstream a changed artifact. Triggers: 'upstream this skill change', 'send local change to marketplace', 'resolve marketplace merge', 'olko-marketplace-upstream'.
---

# olko-marketplace-upstream

## Routing Summary
Upstream one changed marketplace artifact from a project. Three steps: `stage`, `optimize`, `publish`. The marketplace merge workflow uses a fourth step, `resolve`: it resolves conflicted hunks and classifies each local change inside the merge work directory only. Deterministic checks (`olko-marketplace-lock.mjs`, `olko-sanitize.mjs`, `olko-upstream-plan.mjs`) run between them in the factory workflow. They are marketplace gates, not files of this skill: run them from `<marketplace>/scripts/` of the marketplace checkout (see "Script ownership" in `docs/project-change-upstream.md` of the marketplace). Draft PRs only. Never merge.

## Progressive Loading
- Load `overview.md` first.
- Load `workflow.md` when you run a step.
- Load `examples.md` when you write `classification.json` or the PR commit.
- Load `edge-cases.md` for an unknown base, a moved upstream, an append, a deleted file in `resolve`, or a failed command.

## Files
- `overview.md` - scope, inputs, hard rules.
- `workflow.md` - `stage`, `optimize`, `publish` and `resolve` steps.
- `examples.md` - classification and command examples.
- `edge-cases.md` - uncommon branches and stop conditions.
