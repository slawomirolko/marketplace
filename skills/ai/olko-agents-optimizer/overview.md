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
