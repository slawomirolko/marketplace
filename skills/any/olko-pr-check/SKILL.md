---
name: olko-pr-check
description: "Check the latest CI/CD status and newest actionable review feedback on a GitHub PR, then ask which findings to fix. Resolves the PR from the current branch or user-supplied number, waits for required bot workflows when needed, summarizes only current failures/comments, and can hand off selected fixes to project testing and commit skills. Triggers: 'check PR', 'PR check', 'olko-pr-check', 'sprawdz PR', 'sprawdź PR', 'review PR status', 'what is wrong with the PR', 'fix PR comments', 'fix PR findings'."
---

# olko-pr-check

## Routing Summary
Check latest CI/CD + newest actionable review feedback on GitHub PR. Resolve PR from current branch or user number. Summarize current failures/comments. Ask which findings to fix. Triggers: 'check PR', 'PR check', 'olko-pr-check', 'sprawdz PR', 'sprawdź PR', 'review PR status', 'what is wrong with the PR', 'fix PR comments', 'fix PR findings'.

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
