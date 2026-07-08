# Olko Adapt To Marketplace

## Edge Cases
- **Source skill with no `SKILL.md`** — treat as a stub; build the frontmatter + body from scratch in Step 7. Require the user to confirm the description before writing.
- **Re-onboarding an already-registered skill** — preserve the existing entry's identity; update in place (Step 8) rather than appending a duplicate. Bump `version` per semver only if content changed.
- **Name collision after adaptation** — if the adapted name already exists in the registry for a different source, stop and ask the user to resolve before writing.
- **Category directory does not exist** — create `skills/<new-category>/` in Step 6; `registry.mjs` rejects entries whose category has no directory.
- **`--fix` overwrites a field I optimized** — it does not. `scripts/registry.mjs` normalizer uses `??`, so explicit `tags` / `capabilities` / `cost` are preserved; only absent fields are derived. If a value looks reverted, it failed validation (e.g. capability not normalized) and was dropped — fix the value, do not blame `--fix`.
- **Progressive threshold is crossed mid-edit** — if `SKILL.md` grows past 100 lines during 7b/7c fixes, re-evaluate at 7e and scaffold the four section files; a partial set (e.g. only `overview.md`) is rejected by `registry.mjs`.
- **Validation loop does not converge** — if Step 10 fails on the same error twice, stop, show the failing entry + error to the user, and ask how to proceed rather than looping indefinitely.

## Rules
- Follow the [naming convention](../docs/naming.md): `olko-` prefix across folder, frontmatter, and registry for **authored** skills; **vendored** skills keep their upstream name and declare `origin: vendored` in frontmatter (mirrored into the registry entry). Never combine `olko-` with `origin: vendored`.
- Vendored skills are onboarded as-is — do not restructure them into progressive bundles or rewrite their bodies. They register single-file even when long; progressive loading applies only when their section files already exist.
- Every prepared skill must satisfy the [Skill Adaptation Contract](../docs/skill-adaptation-contract.md) checklist before it is registered
- Sub-skills are focused and independently invocable; the parent orchestrates them via `uses` (Explicit Skill Reuse)
- Never auto-load skills — composition is explicit through `uses` declared in the project adapter
- A skill that cannot satisfy the adaptation contract is not registered; report which checklist items failed
- Preserve existing reference files and scripts; copy them into the new directory and fix internal references
- `registry.json` entries must never contain `uses`, `dependencies`, or `runtimeDependencies` — `registry.mjs` rejects them
- Progressive loading is all-or-nothing: either omit `loading`, or provide all four section files (`overview`, `workflow`, `examples`, `edge-cases`) both on disk and in `files`
- Authoring style is scoped caveman, not blanket: compress `SKILL.md` + `overview.md` + prompts; keep clear prose in `workflow.md` (multi-step) and `edge-cases.md` (rules/security); never cavemanize `description`/triggers/commands/paths/errors (see workflow Step 7f, Dimension 4)
- The release cycle is not done until `node scripts/registry.mjs` prints `registry ok` and the `.test.mjs` suite passes
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports its own project adapter at `.agents/skills/olko-adapt-to-marketplace/project.md`
