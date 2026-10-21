---
name: olko-skill-consolidator
description: "Find overlapping skills and agents across user scope, the current project, the Olko marketplace, and a Claude marketplace target, then suggest merging, removing, or extending one with parts of another to reduce their number. Suggestions are evidence-backed and decided one by one; accepted ones become a plan file, declined ones are recorded with a date and not suggested again for 30 days. Never edits skills. Triggers: 'consolidate skills', 'too many skills', 'merge skills', 'duplicate skills', 'skill overlap', 'olko-skill-consolidator'."
version: 1.0.0
---

# olko-skill-consolidator

## Inputs

| Token | Meaning |
|-------|---------|
| `--stores <list>` | Any of `user,project,olko,target`. Default: every store that resolves. |
| `--target <name>` | Claude marketplace target from `olko-sync-state` (default target if omitted). |
| `--include-rejected` | Also show suggestions still inside their 30-day suppression. |
| `--limit <n>` | Max suggestions shown. Default 10. |

## Stores

| Store | Skills | Agents |
|-------|--------|--------|
| `user` | `~/.claude/skills/*/SKILL.md` | `~/.claude/agents/*.md` |
| `project` | `.claude/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md` | `.claude/agents/*.md`, `.opencode/agents/*.md` |
| `olko` | `skills/*/*/SKILL.md`, `plugins/*/skills/*/SKILL.md` under `targets.json` → `olko.path` | `agents/opencode/*.md`, `plugins/*/agents/*.md` |
| `target` | `plugins/*/skills/*/SKILL.md` under the target path | `plugins/*/agents/*.md` |

Resolve paths with `sync-state.mjs target get`, where `sync-state.mjs` means `node "${CLAUDE_PLUGIN_ROOT}/skills/olko-sync-state/scripts/sync-state.mjs"`. Skip a store that does not resolve and say so.

## Steps

1. **Inventory.** For each artifact record id `<store>:<skill|agent>:<name>`, description, trigger phrases, section headings, tools or permissions, referenced skills or delegates, and line count. Read files only; no execution.
2. **Skip known copies.** Copies of the same capability (same `lineage.json` capability, or one `ported-from` the other) are a sync matter, not consolidation. Leave them out.
3. **Candidates.** Pair artifacts with clear overlap: shared trigger phrases, the same job described in different words, one artifact's steps being a subset of another's, or an agent that only wraps one skill. Cross-store pairs count.
4. **Suppression.** For each candidate run `sync-state.mjs rejection check --items <ids>`. The check matches the exact set only, so for a group of three or more also check each pair inside it. Drop a `suppressed` candidate unless `--include-rejected`; with that flag, label the row with `askAgainAfter`. Show a suppressed pair inside a larger group next to that group.
5. **Analyze in parallel.** When the `Agent` tool and the `olko-sync:olko-claude-consolidation-analyst` agent are available, dispatch one analyst per remaining candidate group, all in one message, at most 10 per wave. Wait for the wave before you start the next. If the tool or agent is not available, evaluate each candidate yourself with the same verdicts.
6. **Suggest.** Drop every candidate with verdict `keep`. For the rest, give one verdict:
   - `merge` — fold B into A; B is removed. Name the surviving artifact and store.
   - `remove` — A fully covers B.
   - `extend` — keep both; copy named sections from B into A.
   Each suggestion cites evidence as `file:line` pairs and lists what would be lost.
7. **Decide one at a time.** Present the ranked table, then ask about each row in order, one per message: `accept`, `reject`, or `skip` (skip = decide later, nothing saved).
8. **Record.**
   - `reject` → ask for a one-line reason, then `sync-state.mjs rejection add --items <ids> --suggestion <verdict> --reason "<reason>"`. Tell the user the `askAgainAfter` date.
   - `accept` → append to `consolidation-plan-<YYYY-MM-DD>.md` in the session scratchpad (or a path the user gives): artifacts, verdict, sections to move, references to update, store-specific follow-up.
9. **Report** accepted, rejected, skipped counts and the plan file path.

## Cross-store follow-up in the plan

| Change touches | Follow-up |
|----------------|-----------|
| `olko` | manual change on a feature branch + PR in the Olko checkout |
| `target` | that marketplace's own publishing flow; content from `olko` must pass `olko-port-opencode-to-claude` first and must not reference `olko-*` names |
| `user` | `olko-port-opencode-to-claude` or direct edit of `~/.claude` after confirmation |
| `project` | normal project change on a branch |
| `target` → `olko` | `olko-port-claude-to-opencode` with its sanitize gate |

## Never

- Edit, delete, or rename any skill or agent.
- Suggest a pair that is `suppressed` without `--include-rejected`.
- Put names, paths, or content from `target` into a file inside the Olko checkout.
