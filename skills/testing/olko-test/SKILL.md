---
name: olko-test
description: Run affected or all tests for .NET, Python, and Android/Kotlin with change-aware scope detection, emulator management, service management, and failure handling. Use when asked to run tests, after implementation, or when called from olko-plan-editor/olko-commit skills.
user_invocable: true
---

# olko-test

## Routing Summary
Run affected or all tests for .NET, Python, and Android/Kotlin with change-aware scope detection, emulator management, service management, and failure handling. Use when asked to run tests, after implementation, or when called from olko-plan-editor/olko-commit skills.

Git-worktree test runs use an isolated Compose project when the repository provides `scripts/tests/worktree-compose*.ps1`; the main Compose project and ports are never reused, and cleanup always runs after failures.

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
