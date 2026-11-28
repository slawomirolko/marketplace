---
name: olko-marketplace-upstream
version: 1.0.3
description: Send one local change to an installed marketplace skill or agent back to the marketplace as a draft PR. Stage the change without the project adapter, keep project-specific hunks out, optimize the staged copy, and publish a draft PR that only a person merges or closes. Use when the factory marketplace-upstream watch or the person asks to upstream a changed artifact. Triggers: 'upstream this skill change', 'send local change to marketplace', 'olko-marketplace-upstream'.
---

# olko-marketplace-upstream

## Routing Summary
Upstream one changed marketplace artifact from a project. Three steps: `stage`, `optimize`, `publish`. Deterministic checks (`olko-marketplace-lock.mjs`, `olko-sanitize.mjs`, `olko-upstream-plan.mjs`) run between them in the factory workflow. They are marketplace gates, not files of this skill: run them from `<marketplace>/scripts/` of the marketplace checkout (see "Script ownership" in `docs/project-change-upstream.md` of the marketplace). Draft PRs only. Never merge.

## Progressive Loading
- Load `overview.md` first.
- Load `workflow.md` when you run a step.
- Load `examples.md` when you write `classification.json` or the PR commit.
- Load `edge-cases.md` for an unknown base, a moved upstream, an append, or a failed command.

## Files
- `overview.md` - scope, inputs, hard rules.
- `workflow.md` - `stage`, `optimize` and `publish` steps.
- `examples.md` - classification and command examples.
- `edge-cases.md` - uncommon branches and stop conditions.
