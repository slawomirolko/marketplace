---
name: olko-port-opencode-to-claude
description: "Port one Olko marketplace skill or OpenCode agent into a Claude Code skill or agent and install it into the user scope (~/.claude/skills, ~/.claude/agents) only. Translates frontmatter, tool names, permissions, and memory references; installs declared skill dependencies; shows a diff and asks before overwriting. Never writes to a Claude plugin marketplace or a project. Triggers: 'port olko skill to claude', 'install olko skill for claude', 'opencode to claude', 'olko-port-opencode-to-claude'."
version: 1.0.0
---

# olko-port-opencode-to-claude

## Inputs

| Token | Meaning |
|-------|---------|
| `<olko-path>` | `skills/<category>/<name>` or `agents/opencode/<name>.md` in the Olko checkout. Required. |
| `--claude-home <dir>` | Default `~/.claude`. |
| `--stage <dir>` | Write the translated result here. Default: a new folder in the session scratchpad. |
| `--dry-run` | Stop after step 4. Do not ask, install, or record lineage. Use this mode when you cannot ask the user (for example, as a worker agent). |

## Steps

1. **Read** the Olko artifact. For an agent, also read its `agents/opencode/index.json` entry.
2. **Translate** the artifact with the table below. Write the result into `--stage`.
3. **List dependencies.** For an agent, list its manifest `skills` and `delegates`. For each one that is not in `--claude-home`, report it as a missing dependency. Do not port it in this run. Check exclusions for each: `sync-state.mjs exclusion check --artifact <kind:name> --direction olko->user`.
4. **Diff.** If the target exists, write a unified diff against it. If the target has no `ported-from: olko` marker, report that this skill did not produce it.
5. **Ask** before every write or overwrite. An overwrite is destructive; confirm each file.
6. **Install** to `<claude-home>/skills/<name>/` or `<claude-home>/agents/<name>.md`.
7. **Record lineage**: `sync-state.mjs lineage set --capability <id> --store user --path <installed> --hash <hash> --ported-from olko@<olko-hash>`.

Port missing dependencies first, each in its own run of this skill.

## Translation table

| OpenCode / Olko | Claude Code |
|-----------------|-------------|
| Skill frontmatter | Keep `name`, `description`, `version`; add `ported-from: olko` |
| `skill` tool | `Skill` tool |
| `task` tool + agent name | `Agent` tool with `subagent_type: <name>` |
| ask user / `question` tool | `AskUserQuestion` for 2–4 option choices, plain chat otherwise |
| `read`, `write`, `edit`, `grep`, `glob`, `bash` | `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash` |
| Agent `mode`, `hidden`, `model`, `permission` | `name` (file name), `description`, `model` (`sonnet` default; `haiku` for read-only comparators; `opus` only if the user asks), `tools` |
| `permission.edit: allow` | add `Write`, `Edit` |
| `permission.bash` allow or pattern list | add `Bash`; copy each `deny` pattern into the body as a "Never run" line |
| `permission.task` allow entries | add `Agent`; list allowed delegates in the body |
| `permission.skill` allow entries | add `Skill`; list allowed skills in the body |
| `permission.webfetch/websearch: allow` | add `WebFetch` / `WebSearch` |
| `olko-memory-layer` | keep the reference; install the skill too |
| `.opencode/memory/<agent>.md` | `~/.claude/olko-memory/<agent>.md` |
| `openskills install …` / `install-opencode-agents.mjs` instructions | remove; step 6 of this skill installs the artifact |

Project adapters (`.agents/skill-config.md`, `.agents/skills/<name>/project.md`) stay as they are; Claude reads them from the consuming project at runtime.

## Never

- Write into a Claude plugin marketplace, a plugin cache, or a project's `.claude/`.
- Drop a deny rule or a confirmation gate during translation.
- Overwrite without a shown diff and an explicit yes.
