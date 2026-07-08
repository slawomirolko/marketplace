# Skill naming convention

Marketplace skills fall into two origins. The `olko-` prefix rule applies only to **authored** skills.

## Authored skills — `olko-` prefix required

Skills written for this marketplace MUST use the `olko-` prefix. When adding an authored skill to `registry.json`:
- Ensure the skill folder name starts with `olko-`
- Ensure the `name:` field in `SKILL.md` frontmatter starts with `olko-`
- Ensure the `name` in `registry.json` starts with `olko-`
- If an existing authored skill lacks the prefix, rename it across folder, frontmatter, and registry entry

Example: `smart-commit` → `olko-commit`.

## Vendored skills — keep upstream names

Skills **copied from an external source** (e.g. the `caveman-*` / `smart-*` toolkits) keep their original names. They are internal to this repo but not authored here, so renaming them would break upstream references and make updates harder.

A vendored skill MUST declare its origin in `SKILL.md` frontmatter:

```yaml
---
name: caveman
description: ...
origin: vendored
---
```

`scripts/registry.mjs` exempts `origin: vendored` skills from the `olko-` prefix check. All other validation still applies: the name must match across folder, frontmatter, and registry, and must be normalized (`^[a-z0-9]+(-[a-z0-9]+)*$`). The registry entry mirrors `origin: vendored` so consumers can filter vendored skills.

### When to mark `origin: vendored`

- The skill was copied from an external repo / toolkit and you intend to track upstream.
- The skill references sibling skills by their upstream (non-`olko-`) names.

### When NOT to use it

- The skill was written for this marketplace → use `olko-` instead (no `origin` field; default is `authored`).
- Do not use `origin: vendored` to bypass the prefix for a skill you authored — rename it to `olko-`.
