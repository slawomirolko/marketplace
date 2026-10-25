# Olko Plan Editor

## Edge Cases

## Rules
- Respond in strict caveman mode while performing this skill.
- **NO SHADOW MODES (HARD RULE, user directive 2026-09-13)**: reject/rewrite plans with shadow runs, A/B tests, dual-runs, default-off gates for new mechanisms, or "switch-on later" deploy steps. New mechanism = production from first deploy; rollback = git revert only. See workflow Step 0.
- For a Feature implementation-planning request, create one shared Feature plan and a plan file for every current child Task in the same session.
- Keep Task plans technical and Task-scoped. Reuse the Feature plan as the business source of truth; do not duplicate business plans per Task.
- Every current child Task must have its own implementation plan before the Feature planning session is complete, even when its YouTrack description is detailed.
- Treat an existing plan pair as the source of truth unless the user says otherwise.
- For a new Feature/Epic target, create both default pair members unless a project adapter or user overrides their names.
- Do not overwrite a legacy single plan file merely because its stem matches the new pair. Migrate it only on explicit user request.
- Avoid unnecessary detail outside the requested sections.
- Prefer the smallest set of files and steps that still solves the target.
- Final reply for Feature planning must name the shared Feature plan and all Task plan paths. For an Epic-only plan, name both documents.
- Only a full technical plan requires `Ready for implementation: yes/no`; never claim runtime signals are verified before code is run.
- `Ready for implementation: yes` is FORBIDDEN while any BLOCKING open item exists. Every open question, unresolved assumption, unmet user decision, or unresolved blocker makes the verdict `no`, no matter how many readiness categories are `ready`. The technical document must carry an `## Open items` section classifying each item BLOCKING / VERIFY-DURING-WORK / ACCEPTED-GAP, and an ACCEPTED-GAP requires explicit user acceptance recorded in the tracker. Never present a plan as implementable while questions remain open; a skipped grill or blocker-grill is itself a BLOCKING item.
- Final reply test list should not center on log checking unless the user asked for it.
- Never leave a requested plan only in chat if it can be created.
- When `readArchitectureDocs` or `readTestingDocs` is disabled, use matching stack-specific skills only when they are declared in `uses`; otherwise document the review gap in the technical document.
- Stack-specific plan review is review-only. Do not let architecture/style/testing skills implement changes from inside plan creation.
- **The full re-validation loop (workflow Step 6.5) applies once to the Feature planning batch.** Include questions from all Task plans in the same batch, wait until it closes, then recheck the Feature and every affected Task plan together. Use the Task scope-impact reviewer if a material answer may affect sibling Tasks. Do not repeat accepted Feature decisions.
- Do not auto-load technology skills based on file extensions. Explicit `uses` still controls reuse.
- Build, migration, and saga skills are specialized gates. Use them only for plans that change build wiring, EF Core schema/migrations, or Wolverine saga flow.
- During plan creation, `olko-dotnet-build`, `olko-dotnet-migration`, and `olko-create-saga` should shape steps and verification. Do not let them apply migrations, edit saga code, or fix build output unless the user moves from planning to implementation.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
- Never hardcode project-specific behavior - put it in config or the project adapter.
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-plan-editor/project.md`.
