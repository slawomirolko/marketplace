---
name: olko-investigate-existing
description: Investigate an existing mechanism by name or description — find it, analyze its behavior, map its flow, verify AGENTS.md docs against the docs' own rules, assess optimization/extension opportunities and predict potential errors, then offer to create improvement plans via a declared plan skill. Use when the user wants to understand, document, or improve an existing mechanism in the codebase.
user_invocable: true
---

# olko-investigate-existing

## Routing Summary
Investigate an existing mechanism by name or description — find it, analyze its behavior, map its flow, verify AGENTS.md docs against the docs' own rules, assess optimization/extension opportunities and predict potential errors, then offer to create improvement plans via a declared plan skill. Use when the user wants to understand, document, or improve an existing mechanism in the codebase.

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
