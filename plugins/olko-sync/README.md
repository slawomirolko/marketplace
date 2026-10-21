# olko-sync

Claude Code plugin. Keeps skills and agents in step between a Claude plugin
marketplace the user names at runtime, this marketplace, and `~/.claude`, and
suggests consolidating overlapping skills.

```text
claude plugin marketplace add slawomirolko/marketplace
claude plugin install olko-sync@olko
```

Install scope defaults to user. Components are namespaced: run the manager as
`@agent-olko-sync:olko-claude-sync-manager`, the consolidator as
`/olko-sync:olko-skill-consolidator`.

## Sync agents

`olko-claude-sync-manager` keeps three stores in step:

| Store | What | Written by the manager |
|-------|------|------------------------|
| `target` | a Claude plugin marketplace the user names at runtime | never |
| `olko` | this marketplace | branch + PR only |
| `user` | `~/.claude` | per-file confirmation |

The manager (Sonnet) owns every user question and every write. It fans out to
Haiku 5.5 workers (`model: claude-haiku-5-5`) in parallel waves of up to 10:

| Wave | Worker | Count | Writes |
|------|--------|-------|--------|
| A | `olko-claude-sync-inventory` | one per store (3) | none |
| step 2 | `olko-claude-sync-matcher` | 1 | none |
| B | `olko-claude-sync-comparator` | one per capability | none |
| C | `olko-claude-sync-porter` | one per approved port | its own scratch stage dir |
| D | `olko-claude-consolidation-analyst` | one per candidate group | none |

Skills are preloaded through each agent's `skills:` frontmatter. No agent has
the `Skill` tool, so none can load another skill. Workers cannot spawn agents,
ask the user, or edit files. Writes into the Olko checkout are applied one at a
time by the manager, because `registry.json` and the agent manifest are shared
files.

## Local state

Runtime state lives in `~/.olko-sync/` (or `$OLKO_SYNC_HOME`). Only the
`olko-sync-state` skill script reads or writes it; its `SKILL.md` describes the
files. Nothing about a target is committed here.
`scripts/no-target-leak.test.mjs` fails if a tracked file contains a target
path, its folder name, or a user-defined leak term.

This plugin is self-contained. It does not use, extend, or modify any other
Olko agent, skill, or sync mechanism, and its skills are not in `registry.json`.
