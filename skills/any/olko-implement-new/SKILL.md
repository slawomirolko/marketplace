---
name: olko-implement-new
description: "Implement one or more plan files in a fresh worktree, ensure observability, track resumable progress, run configured style and tests, rebuild affected services, verify logs/traces, then delegate commit and worktree merge. Triggers: 'olko-implement-new', 'implement the plan', 'implement plan', 'resume implement-new', 'continue implementation'."
user_invocable: true
---

# olko-implement-new

## Routing Summary
Implement plan files in fresh worktree. Ensure instrumentation. Track resume file. Run configured style, tests, service rebuild, logs/traces verification, commit, merge. Triggers: "olko-implement-new", "implement the plan", "implement plan", "resume implement-new", "continue implementation".

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
