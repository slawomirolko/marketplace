---
name: olko-summary
description: End-of-session summary - track session-affected files, list investigated docs, summarize changes and problems, outline solved/pending issues, future steps, improvement suggestions, and helpful links. Triggers: "summarize session", "session summary", "wrap up session", "olko-summary".
user_invocable: true
---

# Olko Summary

## Routing Summary

End-of-session summary. Track session-affected files, list investigated docs, summarize changes/problems/status/future steps, suggest improvements, and hand the file set to `olko-commit` when requested.

## Progressive Loading

- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or prompt wording is needed.
- Load `edge-cases.md` only for rules, adaptation behavior, and failure handling.

## Files

- `overview.md` - summary, triggers, defaults, adaptation inputs.
- `workflow.md` - normal execution path.
- `examples.md` - output shape.
- `edge-cases.md` - strict rules and uncommon branches.
