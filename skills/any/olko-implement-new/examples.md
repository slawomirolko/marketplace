# Olko Implement New Examples

## Tracker

```markdown
# olko-implement-new progress — <plan-slug>

## Session metadata
- planPaths: <comma-separated list of absolute plan .md paths in main checkout>
- worktreePath: <absolute path to the worktree>
- branchName: <git branch name>
- mainRepoPath: <absolute path to the main repo checkout>
- createdAt: <ISO 8601 UTC timestamp>
- updatedAt: <ISO 8601 UTC timestamp>

## Step status
- [x] 0 — Read plans and ensure instrumentation
- [x] 1 — Create worktree
- [ ] 2 — Cross-check plans  CURRENT
- [ ] 3 — Implement
- [ ] 4 — Run style checks
- [ ] 5 — Run tests
- [ ] 6 — Rebuild affected services
- [ ] 7 — Verify in logs
- [ ] 8 — Commit
- [ ] 9 — Merge worktree to main
- [ ] 10 — Remove plans

## Changed files

## Failure context

## Notes
```

## Prompts

```text
Fix the plans first, implement anyway, or abort?
Auto-fix, skip and continue, or abort?
Rebuild: <services> — proceed? (y/n)
Ready for commit? (y/n)
Remove plan files now? (y/n)
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
- testCommands:
  - match: "**/*.cs"
    command: "dotnet test"
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
