---
name: olko-pr-description-update
description: "Write or update a GitHub PR description after a PR is opened, especially when a linked Jira PBI or Bug exists. Produces a required 4-sentence PBI/Bug context block and a Mermaid flow diagram, then keeps the rest of the PR body concise. Triggers: 'update PR description', 'write PR body', 'PR description', 'PBI context', 'Bug context', 'Mermaid PR flow'."
---

# olko-pr-description-update

## Routing Summary
Write or update GitHub PR description after PR exists. Especially for linked Jira PBI/Bug. Produces required 4-sentence PBI/Bug context block and Mermaid flow diagram; keeps rest concise. Triggers: 'update PR description', 'write PR body', 'PR description', 'PBI context', 'Bug context', 'Mermaid PR flow'.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path.
- `examples.md` - PR body template and Mermaid shape.
- `edge-cases.md` - failure handling, uncommon branches, and rules.
