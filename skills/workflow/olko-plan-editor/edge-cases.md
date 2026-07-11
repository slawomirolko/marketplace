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
- When `readArchitectureDocs` or `readTestingDocs` is disabled, use matching stack-specific skills only when they are declared in `uses`; otherwise document the review gap in the plan.
- Stack-specific plan review is review-only. Do not let architecture/style/testing skills implement changes from inside plan creation.
- Do not auto-load technology skills based on file extensions. Explicit `uses` still controls reuse.
- Build, migration, and saga skills are specialized gates. Use them only for plans that change build wiring, EF Core schema/migrations, or Wolverine saga flow.
- During plan creation, `olko-dotnet-build`, `olko-dotnet-migration`, and `olko-create-saga` should shape steps and verification. Do not let them apply migrations, edit saga code, or fix build output unless the user moves from planning to implementation.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- Never hardcode project-specific behavior — put it in config or the project adapter
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-plan-editor/project.md`
