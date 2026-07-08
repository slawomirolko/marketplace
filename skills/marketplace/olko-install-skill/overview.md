# Olko Install Skill

## Overview

## What I do
- Validate a skill name exists in the marketplace (`registry.json`)
- Load only the marketplace skill metadata needed to adapt it: `SKILL.md` frontmatter first, then the sections needed for config keys and defaults
- Inspect the current project's `.agents/skill-config.md` and `.agents/skills/<skill-name>/project.md`
- Ask the user what to customize and what to keep (works on fresh installs **and** already-adapted skills)
- Write/update `.agents/skill-config.md` and `.agents/skills/<skill-name>/project.md` following the Layered Skill Adaptation Pattern, Skill Adaptation Contract, and Explicit Skill Reuse rules
- When an adaptation already exists, analyze it for optimization opportunities: token reduction, behavior improvement, and marketplace contribution suggestions
- Print gitignore guidance: commit `.agents/skill-config.md` + project adapters + `.agents/context/memory/`; ignore regenerable `.agents/context/` state (scratchpad/summaries/cache)
- Keep prompts and reports terse. No verbose restatement of marketplace docs.

## When to use me
User says "install skill <name>", "adapt <name>", "configure <name>", "setup <name>", or invokes `/olko-install-skill <name>`. Also when the user wants to re-configure or review an already-adapted skill.

## Context budget

- Read registry metadata first. Do not open full skill bodies until the skill is validated.
- Do not load reference files listed in `files` unless the skill explicitly needs them for adaptation.
- Prefer the smallest set of config keys and adapter lines that solves the request.
- If the target skill should run in caveman mode, encode that in the project adapter with `uses: [caveman]` instead of repeating prose in the adapter.
- If the user wants both this installer and `olko-plan-editor` terse, apply the same `uses: [caveman]` pattern to the plan-editor project adapter too.

## Prerequisites
- Run from the target project's repository root (where `.agents/` will live)
- The marketplace `registry.json` must be accessible (read its path from `.agents/skill-config.md` if present, otherwise ask the user for the marketplace root or registry URL)

## Flag & argument parsing

Parse `$ARGUMENTS`:

| Token | Effect |
|-------|--------|
| `<skill-name>` | The marketplace skill to install/adapt (required) |
| `--help` | Display usage and exit |
| `--force` | Overwrite existing adapter without asking per-field (still confirm once) |

If `--help` or no skill name: display usage and stop.
