# Olko PR Description Update

## Overview
Write/update GitHub PR body after PR exists. Preserve useful existing title, links, summary, performance impact, and testing notes. Add/refresh required PBI/Bug context and flow when linked issue context exists.

## When to use me
Use when creating, writing, or updating a PR body; when `olko-commit` opens a PR and delegates the description phase; or when user asks for PBI/Bug context or Mermaid PR flow.

## Inputs
- PR number or URL
- Current PR body, if any
- Linked PBI/Bug key and title/description, if available
- Change summary and testing results

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `prDescriptionIssuePrefix` | `SYM-` | Issue key prefix for linked PBI/Bug references. |
| `prDescriptionRequireFlow` | `true` | Whether every generated PR body must include the Mermaid `Flow` section. |
| `prDescriptionUpdateCommand` | `gh pr edit <num> --body-file <file>` | Command shape used by agents allowed to update the PR via CLI. |

## Resolution order
1. Load `.agents/skill-config.md` (apply marketplace defaults if absent).
2. If `conventionDiscovery == true`, inspect the repo to infer conventions not stated in config. Skip when `false` or absent.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-pr-description-update/project.md`. Skip when `false` or absent.
5. Execute this skill with accumulated context.

Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
