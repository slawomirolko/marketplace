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
