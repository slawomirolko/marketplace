---
name: olko-implement-current-code
description: "Adopt already-written changes into one Task worktree, validate them against its approved Task plan and Feature context, and hand them to the standard implementation orchestrator. Does not own implementation verification or delivery. Triggers: 'olko-implement-current-code', 'adopt current changes', 'transfer my session changes to a worktree', 'resume implement-current-code'."
user_invocable: true
---

# olko-implement-current-code

## Routing Summary
Adopt already-written changes for one named Task. Verify its approved Task plan and Feature context, inventory and scope-check the existing diff, and transfer it into the Task worktree when needed. If the Task plan is missing, return to the Feature planning session to prepare plans for every child Task. Then return control to `olko-implementation-orchestrator` for all audits, tests, runtime verification, PR, merge, and cleanup. This skill does not run a separate delivery workflow.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and prerequisites.
- `workflow.md` - ordered implementation-transfer path.
- `examples.md` - handoff record and user prompts.
- `edge-cases.md` - resume, failure, service, and safety rules.
