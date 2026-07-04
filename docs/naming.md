# Skill naming convention

All skills MUST use the `olko-` prefix.

When adding a skill to `registry.json`:
- Ensure the skill folder name starts with `olko-`
- Ensure the `name:` field in `SKILL.md` frontmatter starts with `olko-`
- Ensure the `name` in `registry.json` starts with `olko-`
- If an existing skill lacks the prefix, rename it across folder, frontmatter, and registry entry

Example: `smart-commit` → `olko-commit`.
