---
name: olko-worktree-merge
version: 1.1.0
description: "Merge a git worktree branch into the default branch through a GitHub PR, including commit/push handoff, CI and review checks, optional mandatory post-merge acceptance E2E, main checkout update, optional main compose rebuild, and worktree cleanup after verification. Triggers: 'merge worktree', 'olko-worktree-merge', 'merge this branch to main', 'create PR for this worktree', 'finish worktree', 'close worktree'."
user_invocable: true
---

# olko-worktree-merge

## Routing Summary
Merge worktree branch through GitHub PR. Checks commit/push state, conflicts, CI, reviews, compose teardown, main checkout update, required post-merge acceptance E2E when configured, optional compose rebuild, then cleanup. E2E failure retains the worktree. Triggers: "merge worktree", "olko-worktree-merge", "merge this branch to main", "create PR for this worktree", "finish worktree", "close worktree".

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when prompt or report shapes are needed.
- Load `edge-cases.md` only for safety rules and uncommon failure handling.

## Files
- `overview.md` - smallest useful summary, prerequisites, adaptation keys.
- `workflow.md` - ordered PR merge workflow.
- `examples.md` - prompt and report examples.
- `edge-cases.md` - strict rules, conflict handling, cleanup safety.
