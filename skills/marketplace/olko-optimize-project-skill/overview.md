# Olko Optimize Project Skill

## Overview
Project-skill optimizer. Input: finished skill already shaped for one project. Output: same skill, clearer/leaner, still project-specific.

## What I do
- Locate target skill by name or path.
- Read target `SKILL.md`, side files, and matching `.agents/skills/<skill-name>/project.md` when present.
- Read my own `.agents/skills/olko-optimize-project-skill/project.md` when present for optimizer-specific defaults.
- Compare against optimization patterns from `olko-adapt-to-marketplace` and `olko-install-skill`.
- Reduce token waste without removing project facts that make the skill useful.
- Improve routing text, trigger phrases, config alignment, and stale adapter sections.
- Preserve behavior and project-specific constraints.
- Validate changed Markdown/frontmatter and any repo-specific checks that exist.

## What I do not do
- No marketplace onboarding.
- No registry edits for the target skill.
- No `olko-` rename.
- No split into parent/sub-skills.
- No category proposal.
- No conversion into reusable, cross-project skill.
- No deletion of project-specific commands, paths, service names, or quirks unless stale or duplicated elsewhere.

## Inputs
Parse `$ARGUMENTS`:

| Token | Effect |
|-------|--------|
| `<name-or-path>` | Target project-oriented skill. Required. |
| `--project-root <path>` | Explicit project root containing `.agents/`. |
| `--dry-run` | Report proposed edits without writing. |
| `--report-only` | Analyze and report; do not patch. |
| `--help` | Display usage and stop. |

If no target: ask for the skill name or path.

## Prerequisites
- Run from the project root or pass `--project-root`.
- Target skill must already exist and be readable.
- Treat this as local project maintenance, not marketplace publication.

## Adaptation
Read `.agents/skill-config.md` first. If `projectAdapter` is not `false`, read `.agents/skills/olko-optimize-project-skill/project.md` for optimizer-specific project defaults such as allowed target roots, report style, validation commands, or dry-run policy. Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
