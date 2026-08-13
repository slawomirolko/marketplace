---
name: olko-plan-editor
description: "Create or edit a paired business and technical implementation plan for a named item, an existing plan pair, or files to create. Produces a business mechanism document plus a technical delivery document. Uses strict caveman mode and minimal context. Triggers: 'plan', 'make a plan', 'edit plan', 'review plan', 'refine plan', 'plan this'."
user_invocable: true
---

# olko-plan-editor

## Routing Summary
Create or edit paired business and technical implementation plans for a named item, an existing plan pair, or files to create. Produces a business mechanism document plus a technical delivery document. Uses strict caveman mode and minimal context.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or naming examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path.
- `examples.md` - output-pair example.
- `edge-cases.md` - failure handling, uncommon branches, and rules.
