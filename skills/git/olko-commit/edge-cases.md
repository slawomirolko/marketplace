# Olko Commit

## Edge Cases
## Rules
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- Never hardcode project-specific behavior — put it in config or the project adapter
- Sub-skills are loaded only when declared in `uses` in the project adapter; never auto-load
- Never commit `.env` files or secrets
- Remove temp `.txt`/`.log` files before finishing
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-commit/project.md`
