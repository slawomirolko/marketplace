# Agents-MD Optimizer

## Overview

Optimize agent context files (AGENTS.md, CLAUDE.md, etc.) by applying the discoverability filter: remove information agents can discover from code, keep only non-discoverable operational knowledge (gotchas, landmines, non-standard conventions), and mine source code for undocumented gotchas.

Research shows redundant context (directory trees, data flow diagrams) degrades agent performance by 15-20%, while human-authored operational knowledge reduces runtime by ~28%.

## Flag Parsing

Parse `$ARGUMENTS` for optional flags:

| Flag | Effect |
|------|--------|
| `--dry-run` | Analyze and show diff without modifying the file |
| `--report-only` | Output statistics and classification table only |
| `--path <path>` | Target file path (see auto-detection below) |
| `--help` | Display usage and exit |

If `--help` is present, display available flags and a brief description of the workflow, then stop.

## Adaptation

Read `.agents/skill-config.md` first. If `projectAdapter` is not `false`, load `.agents/skills/olko-agents-optimizer/project.md` when present. Precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Recognized keys:

| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Whether to load `.agents/skills/olko-agents-optimizer/project.md` |
| `agentsOptimizerTargets` | `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.windsurfrules`, `codex.md` | Target file auto-detection order |
| `agentsOptimizerLineCountScript` | bundled `scripts/line-count.mjs` | Optional project-specific line count script |
| `agentsOptimizerMinLines` | `20` | Files below this line count are already minimal unless user insists |

Project-specific target names, helper script locations, and optimization constraints belong in `.agents/skill-config.md`, `.agents/skills/olko-agents-optimizer/project.md`, or `AGENTS.md`.
