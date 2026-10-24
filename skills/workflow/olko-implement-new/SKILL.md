---
name: olko-implement-new
description: "Implement one accepted Task from its Task-specific plan in the session's attached worktree; ensure observability, track progress, verify, commit, and merge. Triggers: 'olko-implement-new', 'implement the plan', 'implement Task', 'resume implement-new', 'continue implementation'."
user_invocable: true
---

# olko-implement-new

## Routing Summary
Implement one accepted Task from its Task-specific plan. Feature planning prepares a plan file for every current child Task in one session; implementation runs separately per Task. Reuse the current attached worktree, including an Air-managed worktree, or create a fresh one from the primary checkout. Ensure instrumentation, track progress, verify, commit, merge, and run the required post-merge checks.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and prerequisites.
- `workflow.md` - ordered plan implementation path.
- `examples.md` - prompts, tracker shape, config examples.
- `edge-cases.md` - resume, failure, service, and safety rules.
