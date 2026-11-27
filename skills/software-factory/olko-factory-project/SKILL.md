---
name: olko-factory-project
version: 0.1.0
description: "Script command that reports the Olko marketplace status of one local project for the Software Factory: the harnesses set up in it, every installed skill and agent with its state (current, adapted, outdated, modified, unknown-base, missing, removed, local-only) against the marketplace history, and the factory workflows that run them. Read only for the project. Use when you check a project's marketplace sync or run the project status workflow. Triggers: 'project status', 'project marketplace sync', 'which marketplace skills are installed', 'olko-factory-project'."
---

# olko-factory-project

## Routing Summary
One deterministic command. Run it as `node <this skill>/scripts/project-scan.mjs status [flags]`. It prints one JSON object on stdout. Exit code 0 means success. Any other exit code means an error, with the message on stderr: report the error and stop. The command never writes inside the project.

## Command
- `status --project <folder> [--id <name>] [--marketplace <checkout>] [--factory <folder>] [--out-dir <folder>] [--depth <n>] [--print]`
  Without `--marketplace`, it uses `FACTORY_MARKETPLACE_DIR` or the marketplace checkout that contains this skill. Without `--factory`, it uses `FACTORY_DIR` or `<marketplace>/factory`. `--depth` limits how many marketplace commits per artifact it compares (default 40).
  It writes the full status to `<out dir>/<id>-<time>.json` (default out dir: `~/.skill-factory/project-status`) and prints a short result: `file`, `head`, `counts` (one number per state), `harnesses`, `workflows` (the factory workflows that run an installed artifact) and `summary`. With `--print`, it prints the full status instead and writes no file.

## What it reads
- Harness markers: `.opencode`, `opencode.json(c)` (opencode); `.claude`, `CLAUDE.md` (claude-code); `.codex` (codex); `AGENTS.md`, `.agents` (agents-md).
- Installed skills: `.agents/skills/<name>/`, `.claude/skills/<name>/`, `.opencode/skills/<name>/` (a folder with `SKILL.md`).
- Installed agents: `.opencode/agents/<name>.md`, `.claude/agents/<name>.md`.
- Marketplace sources: `skills/<category>/<name>/`, `plugins/<plugin>/skills/<name>/`, `agents/opencode/<name>.md`, `plugins/<plugin>/agents/<name>.md`, with their git history.

## States
Versions (`installed`, `current`, `nearestVersion`, `lastVersion`) are the front matter `version`, or null without one. The matching short commits (`installedCommit`, `currentCommit`, `nearestCommit`, `lastCommit`) only tell versions apart; they are never shown as a version.

Files are compared after line endings are made the same. The adapter layer never counts as a change: `project.md` in a skill folder and the `model:` line of an agent.

| State | Meaning |
|---|---|
| `current` | Same as the marketplace HEAD, no adapter. |
| `adapted` | Same as HEAD, plus a project adapter or a project model. |
| `outdated` | Same as an older marketplace version (`installed`), HEAD is `current`. |
| `modified` | Not equal to any version; `installed` is the nearest version, `files` lists the files that differ from it, `upstreamMoved` is true when the marketplace changed after it. |
| `unknown-base` | Not equal to any version and no file matches the nearest one (`nearestVersion`). |
| `missing` | Not installed, but an installed agent allows it (`permission.skill` / `permission.task`) or an installed skill names it in `uses`; `requiredBy` names them. |
| `removed` | The marketplace had it once and does not have it now. |
| `local-only` | The marketplace never had it. |

## Rules
- Read only for the project. Never write inside it, never commit, never fetch.
- Do not print the project path in a pull request, commit or marketplace file.
