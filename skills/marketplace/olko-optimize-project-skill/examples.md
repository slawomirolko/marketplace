# Olko Optimize Project Skill

## Examples
Load only when concrete output shape is needed.

## Normal request

```text
olko-optimize-project-skill olko-heartbeat
```

Result: inspect `.agents/skills/olko-heartbeat/project.md` plus target skill files, trim duplicated project adapter text, keep project service names and commands.

## Report shape

```text
Project-skill optimization: olko-heartbeat

| # | Bucket | Location | Finding | Edit |
|---|--------|----------|---------|------|
| 1 | Token | .agents/skills/olko-heartbeat/project.md | repeats default log-check step | drop adapter section |
| 2 | Behavior | .agents/skill-config.md | healthCheckCommand stale | update verified command |
| 3 | Routing | SKILL.md | triggers miss Polish phrase | add local trigger phrase |

Changed:
- .agents/skills/olko-heartbeat/project.md
- .agents/skill-config.md

Preserved:
- docker compose service names
- local trace paths
- confirmation before rebuild
```

## Dry run

```text
olko-optimize-project-skill ./ai/skills/project-flow --dry-run
```

Output: report only, no file writes.

## Upstream suggestion

```text
Possible upstream contribution:
- Target skill documents `traceCommand` behavior poorly. Consider updating marketplace source later.

No upstream edit made.
```
