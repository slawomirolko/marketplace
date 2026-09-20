---
name: olko-implement-new
description: "Implement one or more plan files in the session's attached worktree, or create a fresh one when needed; ensure observability, track progress, verify, commit, and merge. Triggers: 'olko-implement-new', 'implement the plan', 'implement plan', 'resume implement-new', 'continue implementation'."
user_invocable: true
---

# olko-implement-new

## Routing Summary
Implement plan files in the current attached worktree, including an Air-managed worktree, or create a fresh worktree when the session is in the primary checkout. Ensure instrumentation. Track resume file. Run configured style, tests, service rebuild, logs/traces verification, commit, merge, post-merge rebuild from main. Triggers: "olko-implement-new", "implement the plan", "implement plan", "resume implement-new", "continue implementation".

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
