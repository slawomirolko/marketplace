---
name: olko-plan-editor
description: "Plan an accepted Feature in one session: create its business and technical plan plus one implementation plan file for every child Task; later implementation remains per Task. Also supports Epic plans and scoped Task-plan revisions."
user_invocable: true
---

# olko-plan-editor

## Routing Summary
For a Feature, create/update the shared Feature plan and an implementation plan file for every current child Task in one planning session. Reuse accepted Feature decisions, batch open questions across all plans, and revalidate the complete set after the batch closes. Also support Epic plans and scoped Task-plan revisions. Apply strict caveman mode and minimal context.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or naming examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path. Step 6.5 describes the orchestrator's re-validation gate. Collect open questions into a batch and wait until the user resolves the full batch, including follow-ups. Then apply all answers and run the complete readiness-worker, stack-auditor, and consistency pass before cleanup or a readiness verdict. The orchestrator owns this gate; the skill marks where it applies.
- `examples.md` - Feature plan package and per-Task plan examples.
- `edge-cases.md` - failure handling, uncommon cases, and strict rules.
