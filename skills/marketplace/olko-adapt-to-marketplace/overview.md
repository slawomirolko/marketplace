# Olko Adapt To Marketplace

## Overview

The inverse of `olko-install-skill`. That skill installs **from** the marketplace **into** a project. This skill takes a skill **from** a local directory and prepares it **for** the marketplace.

## What I do
- Take a skill by name and locate it on disk (even if it is **not** in `registry.json`)
- Adapt the skill name to the `olko-` naming convention
- Analyze the skill's scope and suggest splitting it into smaller sub-skills orchestrated by one parent skill (when the skill is "fullstack" / does too much)
- Propose the marketplace category directory for the skill
- Prepare the skill and/or sub-skills to follow the marketplace architecture: Layered Skill Adaptation Pattern, Skill Adaptation Contract, Explicit Skill Reuse
- Scaffold progressive loading (`overview` / `workflow` / `examples` / `edge-cases`) when the skill warrants it, reducing `SKILL.md` to a thin router
- Optimize for token cost and routing quality (description + triggers, capabilities, tags, cost)
- Write the **full** `registry.json` entry (no stubs)
- Regenerate derived artifacts: per-category `index.json`, `capability-graph.json`, `search-index.json`
- Run the validation gate (`registry.mjs` + tests) and loop on failures until the skill passes

## When to use me
User says "adapt to marketplace", "onboard `<name>`", "split `<name>`", "prepare `<name>` for marketplace", or invokes `/olko-adapt-to-marketplace <name>`. Also when a skill exists locally but is not yet registered, or when a skill has grown too large and should be decomposed.

## Prerequisites
- Run from the marketplace repository root (where `registry.json`, `skills/`, and `docs/` live), **or** provide the marketplace root path as the first resolved input
- The source skill directory must be readable on disk

## Flag & argument parsing

Parse `$ARGUMENTS`:

| Token | Effect |
|-------|--------|
| `<skill-name>` | The skill to onboard (required). May be a name or a path. |
| `--source <path>` | Explicit source directory for the skill (skip discovery) |
| `--marketplace-root <path>` | Explicit marketplace root (skip discovery) |
| `--no-split` | Analyze but do not propose a split |
| `--dry-run` | Show all proposed changes without writing files |
| `--help` | Display usage and exit |

If `--help` or no skill name: display usage and stop.
