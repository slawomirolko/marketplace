---
name: olko-implementation-journal
version: 1.0.0
description: "Implementation journal template and resume procedure for olko-implementation-orchestrator; load when creating the journal or resuming a Task."
---

# olko-implementation-journal

Load when `olko-implementation-orchestrator` creates the `## Implementation` journal in a Task plan, or resumes a Task.

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-implementation-journal/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.

## Procedure

Journal template:

```markdown
## Implementation

### Session
- Status: <in_progress | blocked | awaiting_confirmation | completed>
- Current step: <step number and name>
- Started at UTC: <ISO 8601 UTC timestamp>
- Updated at UTC: <ISO 8601 UTC timestamp>
- Worktree: <absolute path>
- Branch: <branch name>
- Delegation: <agent, scope, and status; one item per line>

### Step status
- [ ] 0 — Resolve Task input and ensure instrumentation
- [ ] 1 — Create worktree
- [ ] 2 — Cross-check Task and Feature inputs + compatibility preflight (before implementer dispatch)
- [ ] 3a — Failing tests first (`olko-test-first-author`, one failing test per acceptance criterion)
- [ ] 3b — Implement (3a tests read-only; disputes, edge cases, blockers)
- [ ] 3c — Rules re-check
- [ ] 4 — Run style checks
- [ ] 5 — Run tests
- [ ] 6 — Rebuild affected services (ISOLATED worktree compose project ONLY)
- [ ] 7 — Verify logs, traces, and DB state (isolated stack)
- [ ] 7a — Optimize changed agent-context files (`agentsOptimizerSkill`, before commit/review)
- [ ] 7b — Task-to-PR scope gate
- [ ] 7c — Task review (`olko-review-orchestrator` + merge safety, before PR delivery)
- [ ] 8 — Commit
- [ ] 8a — Review PR feedback
- [ ] 8b — Obsidian reconciliation + final commit
- [ ] 8c — Editor syntax/structure verification (VS Code on worktree)
- [ ] 9 — Merge worktree
- [ ] 10 — Retain Task plan through post-merge verification
- [ ] 11 — Rebuild from main, verify, then remove only this Task plan
- [ ] 11a — Final Feature technical audit (after last Task)
- [ ] 11b — Ask whether to remove the Feature plan files (last Task, after a passing Feature audit)

### Changed files
- `<path>` — <agent or primary agent>; <purpose>; <status>

### Verification
- <UTC timestamp> — <style/test/build/log/trace/DB command or check>: <pass/fail>; <evidence or concise result>

### Task reviews
- <Task ID> — <lenses run> — <PASS/FAIL>; <scope and file:line evidence>; <fix/recheck if needed>

### Feature completion audit
- Status: <PENDING | PASS | FAIL>
- Base commit: <SHA>
- Final commit: <SHA>
- Auditors and cumulative scope: <auditors, stacks, and base..HEAD>
- End-to-end acceptance/runtime evidence: <results>
- Findings: <none or affected Task IDs and file:line evidence>
- Feature plan files removal: <PENDING | APPROVED | DECLINED | NOT_APPLICABLE>; <absolute paths and approval timestamp>

### Decisions and approvals
- <UTC timestamp> — <user decision, waiver, or approval>

### Failures and blockers
- <UTC timestamp> — <step>; <failure or blocker>; <next action>

### Delivery
- Commit: <hash or pending>
- Pull request: <URL or pending>
- Merge: <hash or pending>
```

When you resume, read this section first. Use `Current step`, incomplete checklist items, changed files, failures, and delivery state to choose the next action. Preserve all earlier entries. Mark a step complete only after its gate passes. Never delete or rewrite history. Append dated verification, decision, failure, and delegation entries. Update the Session fields and checklist in place.
