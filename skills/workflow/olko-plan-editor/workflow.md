# Olko Plan Editor

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

### Step 6 — Review against architecture, style, and test conventions
Use the relevant `AGENTS.md` files (and architecture docs when `readArchitectureDocs` is enabled) to verify the approach against the solution architecture, coding style, and the local project conventions where the change will land.

If `readArchitectureDocs` or `readTestingDocs` is disabled, do not invent missing rules. Instead, delegate review to matching stack-specific skills declared in `.agents/skills/olko-plan-editor/project.md`:

| Stack | Architecture | Coding style | Test conventions |
|-------|--------------|--------------|------------------|
| .NET | `olko-dotnet-architecture` | `olko-dotnet-style` | `olko-dotnet-testing` |
| Docker | — | `olko-docker-style` | — |
| Python | `olko-python-architecture` | `olko-python-style` | `olko-python-testing` |
| Kotlin/Android | `olko-kotlin-architecture` | `olko-kotlin-style` | `olko-kotlin-testing` |

Pass the draft plan, target files, and known stack context to each matching declared skill. Ask it to review the plan for rule impact only; do not ask it to implement. Fold returned violations or constraints into the plan before persisting it.

If no matching stack skill is declared in `uses`, fall back to the minimal loaded context (`.agents/skill-config.md`, scoped `AGENTS.md`, and project adapter). State the gap in the plan's tradeoffs or assumptions section.

Use broader or specialized declared skills only when the target scope requires them:
- If the plan changes top-level layout, module boundaries, app/service/platform separation, or shared contracts, delegate structural review to `olko-project-architecture`.
- If the plan touches `ai/`, `.agents/`, skill adapters, prompts, templates, or context files, delegate AI-context review to `olko-ai-architecture`.
- If a .NET plan changes `.csproj`, target frameworks, package references, generated code wiring, or build entry points, use `olko-dotnet-build` for feasibility review.
- If a .NET plan creates or changes EF Core migrations/schema, use `olko-dotnet-migration` to shape the migration steps and verification.
- If a .NET plan creates or updates a Wolverine saga, use `olko-create-saga` to shape the saga message flow, timeout, contracts, host wiring, and tests.

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
While using this skill, respond in strict caveman mode.

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
