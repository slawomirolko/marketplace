# Olko Investigate Existing

## Edge Cases
## Rules
- Always read source files before analyzing them — do not guess behavior.
- Discover file types, project markers, and AGENTS.md files from the repo (when `conventionDiscovery` is enabled) or from config/AGENTS.md — never assume a fixed stack list or fixed project names.
- When listing closest matches on a miss, include file paths.
- The flow graph must use real `file:line` references from the codebase, never placeholders.
- Do not create plans without user confirmation.
- Before planning new tests, prove existing tests cannot be modified, parameterized, or merged to cover the behavior.
- Prefer merging tests with the same Arrange across every test tier the repo uses.
- Include merge opportunities from touched test files in improvement plans; do not append duplicate tests beside them.
- Architecture and coding style compliance rules come from the repo's docs or declared stack-specific review skills, not from this skill; cite the doc `file:line` or delegated skill source for every violation.
- Do not auto-load technology architecture/style skills from file extensions. Use matching stack-specific skills only when declared in `uses`; otherwise report the review gap.
- Never create an AGENTS.md where none exists — only update existing ones.
- Only suggest non-inferable AGENTS.md content (skip overviews, flow diagrams, property tables, dependency lists, file indexes, test locations).
- Remove any temp files created during the investigation.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
- Never hardcode project-specific behavior — put it in config or the project adapter.
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-investigate-existing/project.md`.
