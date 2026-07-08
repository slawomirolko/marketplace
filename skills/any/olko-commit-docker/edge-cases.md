# Olko Commit Docker

## Edge Cases
## Rules
- Never hardcode project names, service names, or path mappings — read them from the project adapter
- Never rebuild services in the `neverRebuildServices` list
- Discover the compose file by convention, do not assume a fixed name
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-commit-docker/project.md`
