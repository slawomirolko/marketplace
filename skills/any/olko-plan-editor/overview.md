# Olko Plan Editor

## Overview

Use this skill for plan creation or plan edits.

## What I do
- Create or revise an implementation plan for a named item, an existing file, or a file to create
- Gather only the minimum context needed from the repo
- Produce a structured output: files to create, application flow, design patterns, tradeoffs, tests, and new dependencies
- Persist the plan to a file before the final reply
- Apply strict caveman mode while performing this skill

## When to use me
User says "make a plan", "edit plan", "review plan", "refine plan", "plan this", or invokes `/olko-plan-editor <target>`. Also when the user wants a structured implementation plan with files to create, flow, design patterns, and tests.

## Context budget

- Read only the target file, the nearest `AGENTS.md`, `.agents/skill-config.md`, and the project adapter if enabled.
- Do not scan the whole repo unless the user explicitly asks for wider discovery.
- If the project adapter declares `uses: [caveman]`, load `caveman` first and keep this skill in caveman mode.
- If `caveman` is not declared, still respond in caveman mode and keep prose terse.
- Prefer short bullets, short headings, and short file lists. No extra explanation unless the user asks for it.

## Dependencies (uses)

This skill may delegate test execution to a test skill after the plan is implemented. Declare it in `uses` in the project adapter (`.agents/skills/olko-plan-editor/project.md`):

```yaml
uses:
  - olko-test
```

If a test skill is **not** declared in `uses`, skip test-execution delegation and continue. If declared, delegate to it and follow its result. Do not auto-load skills — composition is explicit through `uses`. See [Explicit Skill Reuse](../../docs/explicit-skill-reuse.md).

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `readArchitectureDocs` | marketplace default | Hints that architecture docs should be read to verify the plan against the solution architecture. |
| `readTestingDocs` | marketplace default | Hints that testing docs should be read to inform the Tests section (test names, locations, conventions). |

The plan file location is project-specific — never hardcode a path; let the user name it or read it from the project adapter. Layer control flags are documented in the [Layered Skill Adaptation Pattern](../../docs/layered-skill-adaptation.md).

## Resolution order

1. Load `.agents/skill-config.md` (apply marketplace defaults if absent).
2. If `conventionDiscovery == true`, inspect the repo to infer conventions not stated in config. Skip when `false` or absent.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-plan-editor/project.md`. Skip when `false` or the file is absent.
5. Execute this skill with the accumulated context.

Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
