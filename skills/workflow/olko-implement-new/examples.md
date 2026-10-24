# Olko Implement New Examples

## Tracker

```markdown
# olko-implement-new progress — <task-id-or-plan-slug>

## Session metadata
- taskId: <YouTrack Task ID>
- featureId: <owning Feature ID or none>
- planPaths: <absolute paths to this Task's implementation plan and linked Feature plan files>
- worktreePath: <absolute path to the worktree>
- branchName: <git branch name>
- mainRepoPath: <absolute path to the main repo checkout>
- createdAt: <ISO 8601 UTC timestamp>
- updatedAt: <ISO 8601 UTC timestamp>

## Step status
- [x] 0 — Resolve Task input and ensure instrumentation
- [x] 1 — Create worktree
- [ ] 2 — Cross-check Task and Feature inputs  CURRENT
- [ ] 3 — Implement
- [ ] 3a — Rules re-check
- [ ] 4 — Run style checks
- [ ] 5 — Run tests
- [ ] 6 — Rebuild affected services
- [ ] 7 — Verify logs, traces, and DB state
- [ ] 7c — Task technical audit
- [ ] 8 — Commit
- [ ] 8a — Wait for opencode review comment
- [ ] 9 — Merge worktree to main
- [ ] 10 — Identify this Task's implementation plan for cleanup
- [ ] 11 — Rebuild from main, verify, then remove only this Task's plan
- [ ] 11a — Final Feature technical audit (after last Task)

## Changed files

## Failure context

## Notes
```

## Shared Feature delivery tracker

For a Feature delivered through Task PRs, keep one persistent tracker in the main checkout at
`<mainRepoPath>/plans/features/<feature-id>/feature-tracker.md`. Do not put it inside a
Task plan file that Step 11 removes.

```markdown
# Feature delivery — <feature-id>

## Feature scope
- Acceptance criteria: <criteria or linked Feature issue>
- Base commit: <SHA captured before the first Task PR>
- Final commit: <pending until all Tasks merge>

## Task delivery and technical audits
| Task | PR | Task audit | Runtime proof (service/time/signature/window/errors) | DB | Status |
|---|---|---|---|---|---|
| <ID> | <URL> | <PASS/FAIL + auditor evidence> | <PASS/FAIL/NOT VERIFIED + evidence> | <PASS/FAIL/N/A + evidence> | <status> |

## Final Feature technical audit
- Status: PENDING
- Auditors and cumulative scope: <after all Task PRs merge; list Task PR merge commits and exclude unrelated mainline changes>
- End-to-end acceptance/runtime evidence: <pending>
- Findings: <none or affected Task IDs and file:line evidence>
```

## Prompts

```text
Fix the Task/Feature scope first, implement anyway, or abort?
Auto-fix, skip and continue, or abort?
Rebuild: <services> — proceed? (y/n)
Rebuild from main: <services> — proceed? (y/n)
Ready for commit? (y/n)
Retry Step <N> now, or abort?
```

## Project Adapter Example

```markdown
# olko-implement-new project adapter

## uses
- olko-worktree-create
- olko-commit-style
- olko-test
- olko-commit
- olko-worktree-merge

## config
- branchPrefix: feature/
- planDirectory: .agents/skills/olko-plan-editor/plans
- trackerGlob: implement-new_*.md
- instrumentationPatterns: ["ILogger", "ActivitySource", "LogInformation", "LogWarning"]
- environmentFileGlobs: [".env", ".env.local", ".env.*.local"]
- environmentTemplateGlobs: [".env.example", ".env.template"]
- styleCommands:
  - match: "**/*.cs"
    command: "dotnet format --verify-no-changes"
- serviceMap:
  - path: "src/api/**"
    services: ["api"]
  - path: "contracts/**"
    services: ["api", "worker"]
- neverRebuildServices: ["postgres", "rabbitmq", "grafana", "loki", "tempo"]
- composeBuildTemplate: "docker compose build {service}"
- composeUpTemplate: "docker compose up -d {service}"
- composeStatusCommand: "docker compose ps"
- logCommands:
  - "docker compose logs --tail=50 {service}"
  - "docker compose logs --since=2m {service}"
- lokiUrl: "http://localhost:3100"
- tempoUrl: "http://localhost:3200"
```
