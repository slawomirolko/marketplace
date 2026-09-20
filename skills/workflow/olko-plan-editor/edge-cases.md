# Olko Plan Editor

## Edge Cases

## Rules
- Respond in strict caveman mode while performing this skill.
- **NO SHADOW MODES (HARD RULE, user directive 2026-09-13)**: reject/rewrite plans with shadow runs, A/B tests, dual-runs, default-off gates for new mechanisms, or "switch-on later" deploy steps. New mechanism = production from first deploy; rollback = git revert only. See workflow Step 0.
- Keep both documents concrete and scoped to the asked target.
- Treat an existing plan pair as the source of truth unless the user says otherwise.
- For a new target, create both default pair members unless a project adapter or user overrides their names.
- Do not overwrite a legacy single plan file merely because its stem matches the new pair. Migrate it only on explicit user request.
- Avoid unnecessary detail outside the requested sections.
- Prefer the smallest set of files and steps that still solves the target.
- Final reply must name both saved or updated plan documents.
- The technical document must state `Ready for implementation: yes/no`; never claim runtime signals are verified before code is run.
- Final reply test list should not center on log checking unless the user asked for it.
- Never leave either plan document only in chat if it can be created.
- When `readArchitectureDocs` or `readTestingDocs` is disabled, use matching stack-specific skills only when they are declared in `uses`; otherwise document the review gap in the technical document.
- Stack-specific plan review is review-only. Do not let architecture/style/testing skills implement changes from inside plan creation.
- **The re-validation loop (workflow Step 6.5) is AGENT-level, not skill-level**: it is enforced by the orchestrating agent (e.g. olko-plan-documentation-orchestrator) and marked in this skill only as a checkpoint. If executing this skill standalone, apply the same loop yourself after every scope/mechanism-changing user decision: readiness worker on the changed slice → stack auditors → consistency gate, before the next grill question / cleanup / readiness verdict. In-session analysis NEVER substitutes for worker/auditor verification; folding a decision marks its claims UNVERIFIED until a worker checks them. A skipped loop is a workflow violation. Record every re-run in the plan tracker.
- Do not auto-load technology skills based on file extensions. Explicit `uses` still controls reuse.
- Build, migration, and saga skills are specialized gates. Use them only for plans that change build wiring, EF Core schema/migrations, or Wolverine saga flow.
- During plan creation, `olko-dotnet-build`, `olko-dotnet-migration`, and `olko-create-saga` should shape steps and verification. Do not let them apply migrations, edit saga code, or fix build output unless the user moves from planning to implementation.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
- Never hardcode project-specific behavior - put it in config or the project adapter.
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-plan-editor/project.md`.
