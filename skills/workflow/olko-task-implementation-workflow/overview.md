# Task Implementation Workflow — Overview

Load at the start of every implementation Task, after its plan is approved and its acceptance criteria exist.

## Lifecycle

Entry gate → worktree → baseline E2E → compatibility preflight → failing tests first → exclusive implementation chunks → style and affected tests → E2E recheck → isolated rebuild → runtime evidence → context-file optimization → scope gate → Task review → PR delivery → PR feedback → Obsidian and editor gates → merge (retain worktree) → post-merge E2E → post-merge runtime → cleanup → Feature audit → plan-file cleanup.

## Ownership

- The primary orchestrator delegates; child agents never delegate and never choose a new dependency or convention.
- The orchestrator owns the Task journal and the shared Feature tracker; children own their chunk only.
- Each shared file, migration, fixture, or generated artifact belongs to exactly one chunk.

## Definition of done

A Task is done when the current acceptance-criteria set passed baseline and post-merge E2E with evidence, the Task review found no blocking issue, the merged commit is verified on the default branch, and runtime evidence proves the behavior ran.
