# Olko Update AI Tech Docs Overview

AI-facing tech-doc updater. Use when user wants agent docs/conventions reviewed or improved for a named stack: Kotlin mobile, Python agents, React frontend, C# backend, etc.

Core flow:
- parse technology, domain, and requested scope
- read relevant project docs fully
- search community AI-skill/convention sources
- compare against local docs
- present concise gap plan
- edit only approved docs

## Configuration keys

Read `.agents/skill-config.md`, then `.agents/skills/olko-update-ai-tech-docs/project.md` when present.

| Key | Default | Meaning |
|-----|---------|---------|
| `technologyDocRoots` | repo root docs plus technology directory docs | Extra doc roots to inspect. |
| `communitySources` | OpenCode ecosystem, `iceflower/agent-skills`, `iceflower/agents-md`, GitHub search | Source list for convention scan. |
| `docOptimizationGuide` | project docs/adapters | Rules for keeping agent docs concise and non-inferable. |
| `priorFindingsFile` | none | Optional previous scan file to reuse for a technology. |
| `allowNewDocs` | `true` | Whether to propose new docs when a scope has no file. |
| `approvalRequired` | `true` | Whether to stop for user approval before edits. |

## Defaults

Map scopes to docs:
- coding style -> `CODING_STYLE.md`
- testing -> `Testing.md`
- architecture, build, security -> `AGENTS.md`, `Architecture.md`, or focused docs
- all -> every relevant existing doc, plus proposed new docs when useful

When editing `AGENTS.md`, include only non-inferable content: naming quirks, cross-boundary validation, custom tooling commands, optional service wiring, and gotchas. Skip repo maps, dependency lists, broad architecture overviews, flow graphs, property tables, file indexes, and test locations.
