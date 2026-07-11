# Olko Optimize Project Skill

## Edge Cases

- **Target is not project-oriented** - stop and ask whether the user wants `olko-adapt-to-marketplace` instead.
- **Target is not installed/adapted yet** - stop and suggest `olko-install-skill`.
- **Target path is inside marketplace source** - optimize only if the user explicitly wants that local source edited; otherwise explain that marketplace publication belongs to `olko-adapt-to-marketplace`.
- **No optimizer adapter exists** - use marketplace defaults for `olko-optimize-project-skill`.
- **No target project adapter exists** - optimize the target skill files only. Do not create `.agents/skills/<target-name>/project.md` unless the user asks.
- **Duplicate text includes a project fact** - keep one authoritative copy. Prefer config for scalar facts, project adapter for local workflow quirks, skill body for default behavior.
- **General improvement found** - report as `Possible upstream contribution`; do not change marketplace source automatically.
- **Safety step is verbose** - clarity wins. Do not cavemanize or compress confirmations, deletes, pushes, deploys, migrations, or other irreversible actions.
- **Validation unavailable** - say which checks were unavailable and report Markdown/frontmatter checks only.

## Rules

- Preserve project specificity. This is the core rule.
- Optimize in place. Do not rename, move, split, register, publish, or generalize the target.
- Use `olko-adapt-to-marketplace` only as an authoring-quality checklist, not as a workflow to run.
- Use `olko-install-skill` only for adapter/config comparison, not for fresh installation.
- Keep existing user/project changes. Do not revert unrelated files.
- Do not delete project commands, paths, service names, or constraints unless verified stale or duplicated in a stronger layer.
- Prefer the Layered Skill Adaptation precedence: config scalar facts, project adapter local overrides, `AGENTS.md` repo conventions, skill defaults.
- Treat `uses` as explicit local reuse. Do not auto-load or infer hidden dependencies.
