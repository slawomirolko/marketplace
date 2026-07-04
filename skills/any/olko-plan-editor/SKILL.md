---
name: olko-plan-editor
description: "Create or edit implementation plans for a named item, an existing file, or a file to create. Produces a structured output with files to create, application flow, design patterns, tradeoffs, and new dependencies. Apply caveman mode while performing this skill. Triggers: 'plan', 'make a plan', 'edit plan', 'review plan', 'refine plan', 'plan this'."
user_invocable: true
---

# Olko Plan Editor

Use this skill for plan creation or plan edits.

## What I do
- Create or revise an implementation plan for a named item, an existing file, or a file to create
- Gather only the minimum context needed from the repo
- Produce a structured output: files to create, application flow, design patterns, tradeoffs, tests, and new dependencies
- Persist the plan to a file before the final reply
- Apply caveman mode while performing this skill

## When to use me
User says "make a plan", "edit plan", "review plan", "refine plan", "plan this", or invokes `/olko-plan-editor <target>`. Also when the user wants a structured implementation plan with files to create, flow, design patterns, and tests.

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

## Workflow — follow these steps in order

### Step 1 — Identify the plan target
Identify the plan target: a name, an existing file, or a file to create.

### Step 2 — Gather minimum context
Gather only the minimum context needed from the repo. When `conventionDiscovery` is `false` and the user has not explicitly requested repo inspection, rely on `.agents/skill-config.md`, `AGENTS.md`, and the Project Adapter only.

### Step 3 — List files to change
Ask for or produce the list of files to change before the final plan is written.

### Step 4 — Draft the plan
Draft or revise the plan so it matches the requested scope and the current codebase.

### Step 5 — Add a Tests section
1. Add a test section to every plan.
2. List unit tests always, and list integration tests when applicable.
3. For each test, include the test name and file/location.
4. Do not make tests focus on log checking or log assertions unless the user explicitly asks for that.
5. If `readTestingDocs` is enabled, read the repo's testing docs to inform test naming and location conventions.

### Step 6 — Review against architecture
Use the relevant `AGENTS.md` files (and architecture docs when `readArchitectureDocs` is enabled) to verify the approach against the solution architecture, coding style, and the local project conventions where the change will land.

### Step 7 — Fold compatible pieces
After the plan is finalized, review the code again for similar existing mechanisms and related functionality, then fold compatible pieces together where possible.

### Step 8 — Call out structural impact
If the plan changes code structure, call out the impact clearly.

### Step 9 — Clean the plan
Clean the plan so it reflects the earlier review steps and removes anything no longer needed.

### Step 10 — Persist the plan
1. Persist the plan to a file before the final reply.
2. If the target file does not exist, create it.
3. If the plan changes, update the saved file again before the final reply.
4. Never leave the plan only in chat if a file target exists or can be created.

### Step 11 — Caveman mode
While using this skill, respond in caveman mode.

### Step 12 — Delegate test execution (optional)
After the plan is approved and implementation is done, if a test skill (e.g. `olko-test`) is declared in `uses`, delegate test execution to it. Provide:
- Path to the plan file (it reads the Tests section to determine scope)
- Any test filter context from the plan

If no test skill is declared in `uses`, skip test execution and stop.

## Required output

When finishing, include:

1. Files to create, grouped by directory.
2. Flow of the application.
3. Design patterns used.
4. Tests, with unit tests always and integration tests when applicable.
5. Each test entry must include test name and file/location.
6. Test scope should avoid log-check assertions unless explicitly requested.
7. Suggestions to clarify or alternate design patterns, with pros and cons.
8. External dependencies, only if any new ones are added.

## Rules
- Respond in caveman mode while performing this skill.
- Keep the plan concrete and scoped to the asked target.
- If the user names a file, treat that file as the source of truth unless the user says otherwise.
- If the user wants a new file, describe exactly what to create and where.
- Avoid unnecessary detail outside the requested sections.
- Final reply must name the saved or updated plan file.
- Final reply must show the test list in the response, not only in the saved file.
- Final reply test list should not center on logs checking unless the user asked for it.
- Never leave plan only in chat if file target exists or can be created.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- Never hardcode project-specific behavior — put it in config or the project adapter
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-plan-editor/project.md`
