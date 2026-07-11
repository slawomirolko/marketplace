---
name: olko-implement-current-code
description: "Move already-written session changes into a fresh worktree, track resumable progress, run configured style and tests, rebuild affected services, verify logs/traces, then delegate commit and worktree merge. Triggers: 'olko-implement-current-code', 'implement current code', 'transfer my session changes to a worktree', 'resume implement-current-code', 'continue current-code implementation'."
user_invocable: true
---

# olko-implement-current-code

## Routing Summary
Move already-written session changes into fresh worktree. Track resume file. Run style, tests, service rebuild, logs/traces verification, commit, merge. Triggers: "olko-implement-current-code", "implement current code", "transfer my session changes to a worktree", "resume implement-current-code", "continue current-code implementation".

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
