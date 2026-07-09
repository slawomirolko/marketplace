---
name: olko-ai-architecture
description: "Check AI context architecture compliance for a project's ai/ tree with marketplace defaults. Reads project docs and adapters, discovers the repo's buildable surfaces (apps/*, services/*, platform/*), verifies the ai/context + ai/skills + ai/prompts + ai/templates layout, surface-split context files, surface-split skill directories, global vs surface separation, no stale/orphaned artifacts, and that the AI tree stays in sync with the codebase surfaces, and reports violations with rule sources. Use when validating AI context organization, during plan review, when onboarding a new app/service surface, or standalone to verify the ai/ tree is complete and not drifting from the codebase."
---

# Olko AI Architecture

## What I do
- Discover the project's buildable surfaces (`apps/*`, `services/*`, `platform/*`, or the documented layout).
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-ai-architecture/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, and the repo root `AGENTS.md`.
- Verify the `ai/` directory layout against documented rules plus marketplace defaults.
- Cross-check that `ai/context/*.md` and `ai/skills/*` stay in sync with the actual codebase surfaces.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `aiArchitectureCommand` | — | Command to run AI-architecture checks. |
| `aiRoot` | `ai/` | Root of the AI context tree, relative to repo root. |
| `aiContextDir` | `ai/context` | Markdown context docs directory. |
| `aiSkillsDir` | `ai/skills` | Skill directories root. |
| `aiPromptsDir` | `ai/prompts` | Reusable prompts directory. |
| `aiTemplatesDir` | `ai/templates` | Templates directory. |
| `aiSurfaces` | discovered from `apps/*`, `services/*`, `platform/*` | Explicit override of surface names. |
| `readArchitectureDocs` | `true` | Whether to read architecture docs. |

## Default AI architecture rules

Apply these defaults unless config, adapter, or project docs override them.

### Root layout
- Keep AI context under a single root directory (default `ai/`) at the repo root (or the documented location).
- Keep four subdirectories: `context/`, `skills/`, `prompts/`, `templates/`. Do not collapse them into one folder.
- Do not scatter AI context files across app/service trees; the `ai/` tree is the single source for AI-facing context, skills, prompts, and templates.

### Context split by surface
- Keep one `global.md` for cross-cutting conventions only (stack-agnostic rules, repo-wide gotchas, shared tooling). Do not put surface/stack-specific rules in `global.md`.
- Keep one markdown file per major buildable surface under `ai/context/`, named after the surface or its stack (e.g. `dotnet-api.md` for the .NET API app, `python-services.md` for the Python services group, `mobile.md` for the mobile app, `workflows.md` for cross-surface process flows).
- A surface context file should exist for each major app/service surface. Grouping closely-related services (e.g. several Python services) into one file is acceptable; splitting one surface across many files is not.
- Do not duplicate the same rule in `global.md` and a surface file. Cross-cutting rules live in `global.md`; surface-specific rules live in the surface file.
- Do not keep one monolith context file in place of the surface split.

### Skills split by surface
- Keep one skill directory per major stack/surface under `ai/skills/`, named `<surface>-architecture` (e.g. `dotnet-architecture`, `python-architecture`, `mobile-architecture`).
- Keep cross-cutting design skills in their own directories for concerns that span surfaces (e.g. `workflow-design`).
- Each skill directory should carry a `SKILL.md` with valid frontmatter (`name` + `description`).
- Do not create skill directories that have no `SKILL.md` or only stub content.
- Do not duplicate a surface's architecture rules across both a context file and a skill directory; pick one home per concern and reference the other.

### Prompts and templates
- Keep reusable prompts under `ai/prompts/` and templates under `ai/templates/`.
- Prompts and templates are reusable assets — do not embed surface-specific architecture rules in them. Surface rules belong in `ai/context/` or `ai/skills/`.

### Sync with the codebase
- The AI tree must stay in sync with the actual repo surfaces. When a new app/service surface is added (`apps/<new>`, `services/<new>`, or equivalent), add the matching `ai/context/<surface>.md` and (when the surface has stack-specific conventions) an `ai/skills/<surface>-architecture/` skill.
- When a surface is removed from the codebase, remove its AI context and skill artifacts in the same change.
- Do not keep AI context/skills for surfaces that no longer exist in the codebase (stale artifacts).
- Do not add a codebase surface without its AI context coverage; a missing context file for a real surface is a violation.

### Separation of concerns
- `global.md` = cross-cutting, stack-agnostic.
- surface context files = stack/surface-specific.
- cross-cutting skill directories (e.g. `workflow-design`) = concerns spanning multiple surfaces.
- Do not mix these layers. A rule belongs in exactly one home; reference others rather than restating.

### Discoverability and non-inferable content
- Context files should hold non-inferable content (naming quirks, cross-boundary validation, tooling commands, config defaults, gotchas). Skip architectural overviews and dependency lists that an agent can discover from code.
- Keep context files discoverable: stable file names matching surfaces, not ad-hoc names.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Detect the AI root (`ai/` by default). Enumerate the repo's buildable surfaces by convention: top-level entries of `apps/`, `services/`, `platform/` (or whatever `aiSurfaces` / docs prescribe).

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-ai-architecture/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `ARCHITECTURE.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Inspect the AI tree structure
Check the `ai/` layout against documented rules plus marketplace defaults. Common checks:
- missing `context/`, `skills/`, `prompts/`, or `templates/` subdirectory
- a monolith context file instead of a surface split
- `global.md` containing surface/stack-specific rules
- duplicated rules across `global.md` and a surface file
- surface file missing for a real codebase surface (`apps/*`, `services/*`, `platform/*`)
- skill directory missing `SKILL.md` or containing only stub content
- a surface that exists in code but has no `ai/skills/<surface>-architecture/` skill
- AI context or skill artifacts for a surface that no longer exists (stale/orphaned)
- surface-specific rules embedded in `ai/prompts/` or `ai/templates/`

### Step 4 - Cross-check coverage
Map each discovered codebase surface to its expected `ai/context/<surface>.md` and `ai/skills/<surface>-architecture/`. Report:
- surfaces missing context coverage
- surfaces missing skill coverage
- AI artifacts with no matching codebase surface

### Step 5 - Run architecture command when configured
If `aiArchitectureCommand` exists, run it from the repo root or documented working directory.

If no command exists, do not invent one. Continue with structure-based inspection.

### Step 6 - Report result
If violations exist:

```text
AI architecture violations:
  1. <file-or-dir> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No AI architecture violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard AI-context conventions per project.
- Never hardcode project-specific surface names, paths, or file names — discover them by convention or from docs.
- Prefer documented project rules over generic AI-context opinions.
- Do not create, move, or delete files unless the user or parent workflow asks for changes.
- Keep output short and actionable.
