# Olko Install Skill

## Edge Cases
## Rules
- Follow the Layered Skill Adaptation Pattern resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- Never hardcode project-specific behavior into the marketplace skill — put it in config or the adapter
- Adapter location is always `.agents/skills/<skill-name>/project.md` (universal `.agents` convention only)
- `uses` is the only way to declare skill-to-skill reuse; never auto-load undeclared skills
- Use caveman style for user-facing prompts unless exact detail is needed for safety or confirmation
- When updating, preserve user choices unless they explicitly drop or modify them
- Read `.agents/skill-config.md` and the target skill's documented config keys before asking — don't ask for keys the skill doesn't recognize
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports its own project adapter at `.agents/skills/olko-install-skill/project.md`
- In update mode, always analyze the existing adaptation across all three dimensions (token reduction, behavior improvement, marketplace contribution) before asking keep/modify/drop
- Gitignore guidance: commit `.agents/skill-config.md`, `.agents/skills/*/project.md`, and `.agents/context/memory/*.md` (shared/durable knowledge); ignore `.agents/context/scratchpad/`, `summaries/`, and `cache/` (regenerable). Print the rule once per install (Step 8). The context tree is created by context-store tooling, not by this skill — this skill only authors `.agents/skill-config.md` and the project adapter.
- Never auto-modify marketplace files — only suggest edits and their locations for the user to contribute upstream explicitly
