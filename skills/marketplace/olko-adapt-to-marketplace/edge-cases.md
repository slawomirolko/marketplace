# Olko Adapt To Marketplace

## Edge Cases
## Rules
- Follow the [naming convention](../docs/naming.md): `olko-` prefix across folder, frontmatter, and registry
- Every prepared skill must satisfy the [Skill Adaptation Contract](../docs/skill-adaptation-contract.md) checklist before it is registered
- Sub-skills are focused and independently invocable; the parent orchestrates them via `uses` (Explicit Skill Reuse)
- Never auto-load skills — composition is explicit through `uses` declared in the project adapter
- A skill that cannot satisfy the adaptation contract is not registered; report which checklist items failed
- Preserve existing reference files and scripts; copy them into the new directory and fix internal references
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports its own project adapter at `.agents/skills/olko-adapt-to-marketplace/project.md`
