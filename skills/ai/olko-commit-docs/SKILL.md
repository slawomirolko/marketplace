---
name: olko-commit-docs
description: "Detect stale AGENTS.md sections after code changes and create AGENTS.md coverage for new feature slices. Only flags non-inferable content (naming quirks, tooling commands, config defaults). Use when olko-commit delegates docs checking, or standalone to verify AGENTS.md is up to date."
---

# Olko Commit Docs

## What I do
- Walk up the directory tree from each changed file to find the nearest `AGENTS.md`
- Detect whether code changes invalidate documented claims (staleness)
- Create `AGENTS.md` coverage for new feature slices that lack one
- Only flag **non-inferable** content — skip architectural overviews, flow diagrams, dependency lists, file indexes, test locations

## When to use me
- Called by `olko-commit` (declared in `uses`) to check docs before committing
- Standalone: user says "check AGENTS.md", "is docs stale", "update docs"

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `readArchitectureDocs` | `false` | If `true`, read architecture docs during staleness check. |
| `readTestingDocs` | `false` | If `true`, read testing docs during staleness check. |

## Workflow

This step has two phases. Run **Phase A first**, then **Phase B**.

### Phase A — Existing AGENTS.md staleness detection

For each changed file, walk up its directory tree until you find the nearest `AGENTS.md`. If one exists, read it and check whether the code change invalidates any of its documented claims.

**How to detect staleness — only check these categories:**
- **Non-inferable naming quirks** — interface name differs from entity, proto field mappings, method renames
- **Custom tooling commands** — build, migration, format, lint invocation
- **Optional service wiring** — nullable DI dependencies
- **Configuration** — documented defaults vs. actual defaults

**Skip**: Behavior flows, architectural overviews, dependency lists, interface signatures, test file tables, location/folder structure — all inferable from code.

**Do NOT flag stale for trivial refactors** (renaming a local variable, extracting a private helper that doesn't change observable behavior, formatting-only changes). Only flag when configuration, naming quirks, or tooling commands materially differ from what the `AGENTS.md` states.

**If staleness is detected**, present findings clearly — `AGENTS.md` path, stale section, what the document says vs. what the code now does. Then ask:

> "Behavior documented in `X/AGENTS.md` (section: Y) is stale due to changes in `Z`.
>
> - **Update AGENTS.md** to match the new code?
> - **Revert the code change** to keep documented behavior?"

If the user chooses **Update**, rewrite the affected `AGENTS.md` sections to match the new code. Keep the same section structure and formatting style as the existing `AGENTS.md`.

If the user chooses **Revert**, undo the code change in that file and re-check.

If no staleness is found: "No existing AGENTS.md documented behavior affected by these changes."

### Phase B — AGENTS.md coverage for new slices

For each changed file, identify if it belongs to a **new** feature slice (a directory 2+ levels deep from a project root — e.g. a `*.csproj` dir for .NET, a `pyproject.toml` dir for Python, a `gradlew` dir for Kotlin — containing implementation code). A slice is "new" when no `AGENTS.md` exists in that directory.

For each new slice found across all changed files:

1. **Check sibling directories in the same parent** — if other slices under the same parent already have `AGENTS.md` files, use one as a template for the new slice. Otherwise use any existing slice-level `AGENTS.md` in the repo as a reference.
2. **Create the slice-level `AGENTS.md`** — include only:
   - Non-inferable naming quirks (interface/entity mismatches, proto field mappings)
   - Cross-boundary validation rules (logic spanning multiple files)
   - Custom tooling commands (build, migration, format invocation)
   - Optional/nullable service wiring
   - Configuration keys and their defaults

   Do NOT include: Purpose, Behavior/Flow, Location, Dependencies, Interface, Testing sections — all inferable from code.
3. **Check for a project-level `AGENTS.md`** — if one exists, update it only if non-inferable quirks need documenting. Do not create project-level `AGENTS.md` files for structure/folder overviews.
4. **If the new slice added contracts** — check the contracts project's `AGENTS.md` (discover by convention: `*.Contracts`, `*.contracts`, or whatever the repo uses) and update its listing only for non-inferable mappings.
5. **Present all proposed `AGENTS.md` changes** to the user and ask: "Create/update these AGENTS.md files? (y/n)"

## Rules
- Only flag/add non-inferable content — skip anything an agent can discover from code
- Never hardcode project-specific paths, project names, or slice templates — discover them by convention
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-commit-docs/project.md`
