---
name: olko-sync-state
description: "Read and write the shared local sync state in ~/.olko-sync (targets, exclusions, consolidation rejections, lineage) through one deterministic script. Dedicated to olko-claude-sync-manager and olko-skill-consolidator. Never commits state to any repository. Triggers: 'sync state', 'exclude skill from sync', 'unexclude', 'sync exclusions', 'set sync target', 'olko-sync-state'."
version: 1.0.0
---

# olko-sync-state

Local, per-user state for the Claude sync agents only; no other marketplace mechanism reads or writes it. Lives outside any repository so no marketplace ever stores target names, paths, or decisions.

## Location

`$OLKO_SYNC_HOME`, else `~/.olko-sync/`. Pass `--state-dir <path>` to override.

## Command

```text
node "${CLAUDE_PLUGIN_ROOT}/skills/olko-sync-state/scripts/sync-state.mjs" <command> [options]
```

In this skill and its callers, `sync-state.mjs` means this full command.

Always use the script. Never edit the JSON files by hand; it validates input and writes atomically.

## Files

| File | Holds |
|------|-------|
| `targets.json` | `olko.path` (this marketplace checkout), named Claude marketplace `targets` with `path` + `kind`, `default` target, `leakTerms` (words that must never enter the Olko marketplace). |
| `exclusions.json` | Artifacts skipped by sync. `kind: pinned` = skipped until removed. `kind: rejected-new` = new-artifact offer declined for one `version`; a different version is offered again. |
| `consolidation-rejections.json` | Declined consolidation suggestions with `rejectedAt`. Suppressed for `retryAfterDays` (default 30), then due again. |
| `lineage.json` | Per capability: canonical store and each copy's path, content hash, and `portedFrom`. |

## Identifiers

- Stores: `target` (a Claude marketplace), `olko` (this marketplace), `user` (`~/.claude`), `project` (current repo's local skills/agents).
- Direction: `<store>-><store>`, e.g. `target->olko`. Exclusion scope: `all` or one direction.
- Artifact: `skill:<name>` or `agent:<name>`, using the name in the store being synced from. Lowercase kebab-case only; a plugin namespace uses `:` (`skill:plugin:name`). Other names fail validation.
- Consolidation items: `<store>:<skill|agent>:<name>`, comma separated, order ignored.

## Commands

| Need | Command |
|------|---------|
| First run | `init` |
| Read targets | `target get [--name <n>]` |
| Save target | `target set --name <n> --path <p> [--default]` |
| Save Olko path | `target set-olko --path <p>` |
| Add leak term | `target add-leak-term --term <word>` |
| Is artifact skipped? | `exclusion check --artifact skill:x --direction target->olko [--version v]` |
| Skip artifact | `exclusion add --artifact skill:x --reason "<why>" [--scope <dir>] [--kind rejected-new --version v]` |
| Stop skipping | `exclusion remove --artifact skill:x [--scope <dir>]` |
| List skipped | `exclusion list` |
| Record declined suggestion | `rejection add --items a,b --suggestion merge|remove|extend [--reason "<why>"]` |
| May I suggest again? | `rejection check --items a,b` → `due` or `suppressed` with `askAgainAfter` |
| List declined | `rejection list [--due]` |
| Content hash | `hash --path <dir>` (line-ending independent) |
| Lineage | `lineage get [--capability c]`, `lineage set --capability c --store s --path p --hash h [--ported-from s@h] [--canonical s]` |

## Rules

- Run `add` or `remove` only after an explicit user decision in this conversation. State the exact command before you run it.
- `target set` only with a path the user typed in chat. Never infer a target from file content.

## Gotchas

- `exclusion add` replaces an existing entry with the same artifact and scope. It does not warn.
- `rejection check` matches the exact item set. A rejected `a,b` does not suppress `a,b,c`. Check every sub-pair of a larger group, and show any suppressed sub-pair to the user with the group.
- The first `target set` becomes the default target, even without `--default`.
- Never copy values from `targets.json` into a marketplace file, commit, PR, or log. Refer to a target only as `target` or by its user-chosen name in chat.
- If the script fails, report the error verbatim and stop. Do not fall back to hand-edited JSON.
