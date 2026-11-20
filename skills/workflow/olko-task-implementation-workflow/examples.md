# Task Implementation Workflow — Examples

## Example 1 — fresh Task

1. Entry gate: Task with criteria plus approved plan; read the Feature plan and shared tracker.
2. Delegate worktree creation, then baseline E2E from the approved manifest.
3. Run the four read-only workers; only four `PASS` verds permit implementation.
4. `olko-test-first-author` writes one failing test per criterion.
5. Dispatch small exclusive chunks; collect changed files and evidence after each.
6. Style, tests, E2E recheck, isolated rebuild, runtime evidence, context-file gate, scope gate, Task review.
7. Deliver the PR only after explicit confirmation; handle review findings; then merge.

## Example 2 — adopted diff

Changes already exist. Load the adoption skill for intake only, count the existing diff against the path budget **before** any handoff, reuse the diff, and continue every gate. Never let an implementer overwrite the adopted paths.

## Example 3 — blocked decision

A child returns `Blocked:` with two options. Ask one question with both options verbatim and your recommendation first, re-dispatch with the decision, then propose where to persist it (ADR, rule file, or `AGENTS.md`) so the same stop does not repeat.
