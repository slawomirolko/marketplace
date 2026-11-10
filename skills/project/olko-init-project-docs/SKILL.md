---
name: olko-init-project-docs
description: "Initialize a project's decision store — ADRs, scoped rule files, and C4 architecture docs — from the existing codebase. Scans the code read-only, grills the user one candidate at a time (record / reword / skip), then writes the approved files itself. Re-runs fill only missing files and never overwrite. Use when a project has no docs/adr or docs/rules yet, or when the user asks to init or bootstrap project docs. Triggers: 'init project docs', 'seed ADRs', 'bootstrap docs/rules', 'create decision store', 'olko-init-project-docs'."
user_invocable: true
---

# olko-init-project-docs

## Routing Summary
Create the project decision store that agents read: `adrDirectory` (ADR files, template, log with scope globs), `rulesDirectory` (rule files with scope globs, table), and `architectureDirectory` (C4 levels 1 and 2). Scan code, grill the user one candidate at a time, write only what the user approves. No commit. Triggers: "init project docs", "seed ADRs", "bootstrap docs/rules", "olko-init-project-docs".

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` when writing a file or asking a grill question.
- Load `edge-cases.md` for re-runs, conflicts, and uncommon branches.

## Files
- `overview.md` - summary, inputs, config keys, defaults, store layout.
- `workflow.md` - scan, grill, write; file contents to create.
- `examples.md` - grill question and file shapes.
- `edge-cases.md` - re-runs, conflicts, strict rules.
