# Olko Plan Editor

## Overview

Plan a Feature as one package: its business-and-technical plan plus one implementation plan for every current child Task:

- For an accepted Feature, prepare its business/technical plan and one implementation plan file for every current child Task in one planning session. Reuse accepted Feature decisions in each Task plan.
- For a Feature, create or edit the linked business and technical plan pair and include every child Task file in the same session. An Epic-only request creates its linked pair.
- Record predecessor dependencies in Task plans; do not defer planning later Tasks. When a Task plan is split or superseded, mark and link only that file. Preserve the shared Feature package and unaffected Task plans.

## What I do
- Create or revise a Feature plan package with one plan file per Task, or linked Epic documents.
- Keep the Feature business goal and progress map at Feature level.
- In each Task plan, document only that Task's implementation and link to shared Feature context.
- Gather only the minimum context needed from the repo.
- Keep business intent separate from code-level implementation detail.
- Persist only the files required by the selected plan depth.
- Apply strict caveman mode while performing this skill.

## When to use me
User says "make a plan", "edit plan", "review plan", "refine plan", "plan this", or invokes `/olko-plan-editor <target>`. Also use it when the user wants a business explanation plus a structured technical implementation plan.

## Context budget

- Read only the target Task and Feature context or target plan pair, the nearest `AGENTS.md`, `.agents/skill-config.md`, and the project adapter if enabled.
- Do not scan the whole repo unless the user explicitly asks for wider discovery.
- If the project adapter declares `uses: [caveman]`, load `caveman` first and keep this skill in caveman mode.
- If `caveman` is not declared, still respond in caveman mode and keep prose terse.
- Prefer short bullets, short headings, and short file lists. No extra explanation unless the user asks for it.

## Dependencies (uses)

This skill may delegate plan review and test execution to other skills. Declare dependencies in `uses` in the project adapter (`.agents/skills/olko-plan-editor/project.md`):

```yaml
uses:
  - olko-project-architecture
  - olko-ai-architecture
  - olko-dotnet-style
  - olko-dotnet-architecture
  - olko-dotnet-testing
  - olko-dotnet-build
  - olko-dotnet-migration
  - olko-create-saga
  - olko-docker-style
  - olko-python-architecture
  - olko-python-style
  - olko-python-testing
  - olko-kotlin-architecture
  - olko-kotlin-style
  - olko-kotlin-testing
  - olko-react-architecture
  - olko-react-style
  - olko-react-testing
  - olko-test
```

If `readArchitectureDocs` or `readTestingDocs` is disabled, use declared stack-specific skills to review architecture, coding style, and test-convention impact for the detected stack. If a matching stack skill is not declared in `uses`, fall back to the minimal local `AGENTS.md` and project adapter context; do not auto-load skills. If `olko-test` is declared, delegate test execution to it after implementation. See [Explicit Skill Reuse](../../docs/explicit-skill-reuse.md).

Use broader or specialized dependencies only when the plan scope calls for them:
- `olko-project-architecture`: plans that change repo structure, app/service/platform boundaries, module layering, or cross-surface contracts.
- `olko-ai-architecture`: plans that touch `ai/`, `.agents/`, skill adapters, context files, prompts, or templates.
- `olko-dotnet-build`: .NET feasibility checks when the plan changes project files, target frameworks, package references, or build wiring.
- `olko-dotnet-migration`: EF Core schema or migration plans.
- `olko-create-saga`: Wolverine saga creation or update plans.

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `readArchitectureDocs` | marketplace default | Hints that architecture docs should be read to verify the technical document against the solution architecture. |
| `readTestingDocs` | marketplace default | Hints that testing docs should be read to inform the technical document's Tests section. |

For a Feature, use the project adapter's Feature package path and create one Task plan file per child Task in the same session. For a standalone Epic plan, the plan-pair location is project-specific; a project adapter may override it. Otherwise, derive a same-directory pair from the user target: `<stem>-business.md` and `<stem>-technical.md`. Layer control flags are documented in the [Layered Skill Adaptation Pattern](../../docs/layered-skill-adaptation.md).

## Resolution order

1. Load `.agents/skill-config.md` (apply marketplace defaults if absent).
2. If `conventionDiscovery == true`, inspect the repo to infer conventions not stated in config. Skip when `false` or absent.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-plan-editor/project.md`. Skip when `false` or the file is absent.
5. Execute this skill with the accumulated context.

Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
