# Olko Implement Current Code Examples

## Tracker

```markdown
# olko-implement-current-code progress — <slug>

## Session metadata
- worktreePath: <absolute path to the worktree>
- branchName: <git branch name>
- mainRepoPath: <absolute path to the main repo checkout>
- sessionChangedFiles: <comma-separated list of files created/modified in the main repo during this session>
- createdAt: <ISO 8601 UTC timestamp>
- updatedAt: <ISO 8601 UTC timestamp>

## Step status
- [x] 0 — Collect session-changed files
- [x] 1 — Create worktree
- [ ] 2 — Transfer session files to worktree  CURRENT
- [ ] 3 — Run style checks
- [ ] 4 — Run tests
- [ ] 5 — Rebuild affected services
- [ ] 6 — Verify in logs
- [ ] 7 — Commit
- [ ] 8 — Merge worktree to main

## Changed files

## Failure context

## Notes
```

## Prompts

```text
Are these the files to transfer into the worktree? (confirm or adjust)
Suggested branch name: feature/<short-kebab-case-description> — accept? (y/n)
No logging/telemetry found in the changed files. Add instrumentation before proceeding? (y/n)
Rebuild: <services> — proceed? (y/n)
Ready for commit? (y/n)
```

## Project Adapter Example

```markdown
# olko-implement-current-code project adapter

## uses
- olko-worktree-create
- olko-commit-style
- olko-test
- olko-commit
- olko-worktree-merge

## config
- branchPrefix: feature/
- trackerGlob: implement-current-code_*.md
- instrumentationPatterns: ["ILogger", "ActivitySource", "LogInformation", "LogWarning"]
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
