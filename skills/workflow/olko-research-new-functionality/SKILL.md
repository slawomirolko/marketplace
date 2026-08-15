---
name: olko-research-new-functionality
description: Research a proposed functionality in the current repository, trace existing flows and boundaries, compare suitable architecture patterns, estimate measurable impact, and produce an implementation-ready integration report. Use when the user asks to analyze, evaluate, scope, or design a new cross-cutting feature before implementation.
---

# olko-research-new-functionality

## Routing Summary
Research the requested functionality from current repository evidence and return a decision-quality report. Keep the work read-only unless the user explicitly requests an artifact or implementation. Do not create README, SUMMARY, INDEX, or other Markdown files automatically; write a report file only when the user names or explicitly requests one.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path.
- `examples.md` - example outputs, prompt wording, and command snippets.
- `edge-cases.md` - failure handling, uncommon branches, and rules.
