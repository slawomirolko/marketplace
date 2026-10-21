---
name: olko-port-claude-to-opencode
description: "Port one Claude Code skill or agent (from a Claude plugin marketplace or ~/.claude) into an OpenCode-ready olko- skill or agent staged for the Olko marketplace. Translates frontmatter, tool names, plugin-relative paths, and memory skills, then runs a mandatory sanitize gate that blocks company-, project-, or person-specific content. Stages the result for olko-claude-sync-manager; never publishes itself. Triggers: 'port claude skill to opencode', 'port to olko', 'claude to opencode', 'olko-port-claude-to-opencode'."
version: 1.0.0
---

# olko-port-claude-to-opencode

## Inputs

| Token | Meaning |
|-------|---------|
| `<source-path>` | Claude skill directory (contains `SKILL.md`) or agent file (`agents/*.md`). Required. |
| `--existing <olko-path>` | Olko copy to update instead of creating a new one. |
| `--stage <dir>` | Output directory. Default: a new folder in the session scratchpad. |

## Steps

1. **Read** every file in the source. Never write into the source.
2. **Name.** New artifact: `olko-<verb-noun>` per `docs/naming.md`; drop plugin namespaces (`plugin:skill` → `skill`). Existing: keep the Olko name.
3. **Translate** with the table below. Keep the behavior; change only the platform layer.
4. **Sanitize gate** (mandatory, see below). Stop until every finding is resolved.
5. **Stage** the result in `--stage`. With `--existing`, also write a unified diff against the Olko copy.
6. **Report**: staged path, renamed identifiers, translation notes, sanitize findings and resolutions, untranslatable parts, and a proposed `registry.json` entry (name, category, version, description, tags, capabilities, cost, files). Return to the caller. Do not touch `registry.json` or any other Olko file.

## Translation table

| Claude Code | OpenCode / Olko |
|-------------|-----------------|
| Skill frontmatter `name`, `description` | Same keys; add `version` (SemVer). Remove Claude-only keys (`allowed-tools`, `disable-model-invocation`, `user-invocable`). |
| `Skill` tool | `skill` tool |
| `Agent` tool / subagent / `subagent_type` | `task` tool with the delegate agent name |
| `AskUserQuestion` | ask the user in chat (`question` tool when available) |
| `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash` | `read`, `write`, `edit`, `grep`, `glob`, `bash` |
| `${CLAUDE_PLUGIN_ROOT}/…` and plugin-relative paths | skill-relative paths |
| Plugin `dependencies` / cross-plugin skill refs | explicit `uses` per `docs/explicit-skill-reuse.md`, or inline the needed behavior |
| Learning / memory skills of the source marketplace | `olko-memory-layer` |
| Hard-coded project facts | adapter keys per `docs/skill-adaptation-contract.md` |
| Agent `name`, `description`, `tools`, `model` | `description`, `mode` (`primary` if user-invoked, else `subagent` + `hidden: true`), `model` (copy the `model` frontmatter value of a sibling agent file in `agents/opencode/`; `index.json` has no model field), `permission` |
| Agent `tools` list | `permission.edit/bash/webfetch/websearch` allow/deny; `permission.skill` = `"*": deny` then one `allow` per used skill; `permission.task` = `"*": deny` then one `allow` per delegate |

Also add the agent's manifest entry fields (`stack`, `role`, `skills`, `delegates`) to the report so the caller can update `agents/opencode/index.json`.

## Sanitize gate

Load leak terms: `node "${CLAUDE_PLUGIN_ROOT}/skills/olko-sync-state/scripts/sync-state.mjs" target get` → `leakTerms`, plus every target path and its last path segment. Then scan the staged files for:

- any leak term (case-insensitive);
- absolute paths, user names in paths, drive letters;
- ticket keys (`[A-Z][A-Z0-9]+-\d+`), e-mail addresses, GUIDs, internal host names and URLs;
- organization, product, customer, tenant, team, or person names;
- service names, repository names, environment names, and secrets of any kind.

Show each finding as `file:line — text — proposed generic replacement`. Allowed resolutions: replace with a generic term, move to a project adapter key, or delete. Only the user may approve keeping a finding, one finding at a time. Never stage a file with an unresolved finding. Never print values from `targets.json` in the report; say `leak term #n`.

## Never

- Publish, commit, or edit the Olko registry.
- Write to the source marketplace or `~/.claude`.
- Reduce safety gates or confirmations while translating.
