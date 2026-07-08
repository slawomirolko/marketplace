# Olko Plan Editor

## Edge Cases
## Rules
- Respond in strict caveman mode while performing this skill.
- Keep the plan concrete and scoped to the asked target.
- If the user names a file, treat that file as the source of truth unless the user says otherwise.
- If the user wants a new file, describe exactly what to create and where.
- Avoid unnecessary detail outside the requested sections.
- Prefer the smallest set of files and steps that still solves the target.
- Final reply must name the saved or updated plan file.
- Final reply must show the test list in the response, not only in the saved file.
- Final reply test list should not center on logs checking unless the user asked for it.
- Never leave plan only in chat if file target exists or can be created.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- Never hardcode project-specific behavior — put it in config or the project adapter
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-plan-editor/project.md`
