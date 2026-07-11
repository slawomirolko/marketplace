---
name: olko-plan-editor
description: "Create or edit implementation plans for a named item, an existing file, or a file to create. Produces a structured output with files to create, application flow, design patterns, tradeoffs, and new dependencies. Uses strict caveman mode and minimal context. Triggers: 'plan', 'make a plan', 'edit plan', 'review plan', 'refine plan', 'plan this'."
user_invocable: true
---

# olko-plan-editor

## Routing Summary
Create or edit implementation plans for a named item, an existing file, or a file to create. Produces a structured output with files to create, application flow, design patterns, tradeoffs, and new dependencies. Uses strict caveman mode and minimal context. Triggers: 'plan', 'make a plan', 'edit plan', 'review plan', 'refine plan', 'plan this'.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path.
- `examples.md` - example outputs, prompts, and command snippets.
- `edge-cases.md` - failure handling, uncommon branches, and rules.
