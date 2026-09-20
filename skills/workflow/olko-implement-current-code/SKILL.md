---
name: olko-implement-current-code
description: "Continue already-written session changes in the current attached worktree, or move them into a fresh one when needed; then verify, commit, and merge. Triggers: 'olko-implement-current-code', 'implement current code', 'transfer my session changes to a worktree', 'resume implement-current-code', 'continue current-code implementation'."
user_invocable: true
---

# olko-implement-current-code

## Routing Summary
Continue already-written session changes in the current attached worktree, including an Air-managed worktree. Only create and transfer into a fresh worktree when the session is in the primary checkout. Track resume file. Run style, tests, service rebuild, logs/traces verification, commit, merge. Triggers: "olko-implement-current-code", "implement current code", "transfer my session changes to a worktree", "resume implement-current-code", "continue current-code implementation".

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and prerequisites.
- `workflow.md` - ordered implementation-transfer path.
- `examples.md` - prompts, tracker shape, config examples.
- `edge-cases.md` - resume, failure, service, and safety rules.
