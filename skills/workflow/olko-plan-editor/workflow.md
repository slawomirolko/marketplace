# Olko Plan Editor

## Workflow - follow these steps in order

### Step 0 - NO SHADOW MODES (HARD RULE, user directive 2026-09-13)
Applies to every plan you draft or review:
- ❌ NO shadow modes: never plan a new mechanism as experiment, shadow run, A/B test, dual-run, or parallel comparison alongside the old one
- ❌ NO switched-off mechanisms: never plan a new mechanism behind a default-off flag/env/mode gate with the old one active in production — a planned mechanism IS the production behavior from its first deploy
- ❌ NO separate production/testing release tracks: one production path; rollback = `git revert` / redeploy of a previous commit, NOTHING else
- ✅ Plans must REPLACE the old mechanism and delete superseded code paths, not keep them as fallback modes
- ✅ Feature flags/env gates allowed ONLY for genuinely external runtime variability (user-facing toggles, infrastructure endpoints) — never to gate a new mechanism off by default
- ✅ Reject and rewrite any plan/scenario containing shadow phases, gradual-rollout mode gates for new mechanisms, or "switch-on later" deployment steps — the switch-on is part of the change itself
- This rule overrides any plan-scenario template or previous plan convention; escalate to the user only when genuinely external variability makes the boundary unclear

### Step 1 - Identify the plan pair
Identify the logical plan target, then resolve two linked files.

- Default new pair: `<stem>-business.md` and `<stem>-technical.md` in the same directory.
- If the user names either member of an existing pair, update both members.
- A project adapter may override this naming or location.
- If the user names a legacy single plan file, do not overwrite it. Create a neighboring pair from its stem unless the user explicitly requests migration.

### Step 2 - Gather minimum context
Gather only the minimum context needed from the repo. When `conventionDiscovery` is `false` and the user has not explicitly requested repo inspection, rely on `.agents/skill-config.md`, `AGENTS.md`, and the Project Adapter only.

### Step 3 - List files to change
Ask for or produce the implementation file list before the technical document is written.

### Step 4 - Draft the business document
Draft or revise `<stem>-business.md` in business language. Include:

1. Business purpose and problem.
2. Users or business consumers and expected value.
3. Mechanism description: inputs, decisions, outputs, and visible behavior.
4. Scope, non-goals, assumptions, risks, and success criteria.

Do not put file lists, class names, implementation steps, or low-level test details here unless they are required to explain a business boundary.

### Step 5 - Draft the technical document and add tests
Draft or revise `<stem>-technical.md`. Link to the business document and include the files to create or change, application flow, design patterns, tradeoffs, configuration, dependencies, structural impact, implementation steps, and tests.

Add `## Implementation readiness` before `## Tests`. It must state `Ready for implementation: yes/no` and map each item to real evidence or an explicit gap:

1. Architecture pattern and owner: target classes/modules and applicable rules.
2. Dependencies: contracts, DI/composition, packages, configuration, persistence/migration boundary, and external dependencies.
3. Instrumentation design: existing local pattern, code point, log/span/metric/event name, tags, and success/failure coverage.
4. Runtime verification contract: affected service, health/status check, feature trigger, expected logs/traces/metrics, and what cannot be confirmed before code runs.
5. Error readiness: trigger, planned handling, retry/idempotency boundary, blast radius, and validation test.

`Ready for implementation: yes` is allowed only when every item is verified or explicitly user-approved as an exception. It is a design-readiness result, never proof that runtime logs, traces, health, or behavior have succeeded.

1. Add a Tests section to the technical document.
2. List unit tests always, and list integration tests when applicable.
3. For each test, include the test name and file/location.
4. Do not make tests focus on log checking or log assertions unless the user explicitly asks for that.
5. If `readTestingDocs` is enabled, read the repo's testing docs to inform test naming and location conventions.

### Step 6 - Review against architecture, style, and test conventions
Use the relevant `AGENTS.md` files (and architecture docs when `readArchitectureDocs` is enabled) to verify the technical document against the solution architecture, coding style, and the local project conventions where the change will land.

If `readArchitectureDocs` or `readTestingDocs` is disabled, do not invent missing rules. Instead, delegate review to matching stack-specific skills declared in `.agents/skills/olko-plan-editor/project.md`:

| Stack | Architecture | Coding style | Test conventions |
|-------|--------------|--------------|------------------|
| .NET | `olko-dotnet-architecture` | `olko-dotnet-style` | `olko-dotnet-testing` |
| Docker | - | `olko-docker-style` | - |
| Python | `olko-python-architecture` | `olko-python-style` | `olko-python-testing` |
| Kotlin/Android | `olko-kotlin-architecture` | `olko-kotlin-style` | `olko-kotlin-testing` |
| React/TypeScript | `olko-react-architecture` | `olko-react-style` | `olko-react-testing` |

Pass the technical draft, target files, and known stack context to each matching declared skill. Ask it to review the plan for rule impact only; do not ask it to implement. Fold returned violations or constraints into the technical document before persisting it. Reflect a changed scope, assumption, or business risk in the business document too.

If no matching stack skill is declared in `uses`, fall back to the minimal loaded context (`.agents/skill-config.md`, scoped `AGENTS.md`, and project adapter). State the gap in the technical document's tradeoffs or assumptions section.

### Step 6.5 - RE-VALIDATION LOOP (orchestrator-level HARD GATE)
**NOTE ON OWNERSHIP: this gate is enforced by the ORCHESTRATING AGENT (e.g. olko-plan-documentation-orchestrator), not by this skill's own logic — this skill's workflow only documents where the orchestrator's loop check must fire. If you are executing this skill standalone and the user changes scope/mechanism mid-session, apply the same check yourself.**

**Trigger:** EVERY user decision that changes plan scope, mechanism, or contract — grill answers, locked decisions, escalations — REGARDLESS of how the plan documents were edited afterward.

**Required actions, in order, EVERY time:**
1. Re-run the readiness/investigation worker (read-only) on the CHANGED slice of the final documents; it must verify every new/changed claim against the actual codebase with `file:line` evidence.
2. Re-run the applicable stack-specific auditors (same set as the initial audit) on the changed slice.
3. Re-run the business↔technical consistency gate in both directions on the updated documents.
4. Fold verified findings; if folding changes the documents again, repeat this step 6.5 once more until a full pass yields no new findings.
5. Only then may the plan advance to the next grill question, to cleanup, or to a readiness verdict.

**HARD RULES:**
- NEVER declare `Ready for implementation: yes`, NEVER close the grill, and NEVER report completion while any user decision from the session has not been re-validated by this loop.
- Never substitute the editing agent's in-session analysis for worker/auditor verification: statements added during decision-folding (new file lists, dropped tables, re-pointed consumers, pinned ids) count as UNVERIFIED until a worker checks them against the code.
- Record each loop re-run in the plan tracker (`tracker.md`) with its gate status; a skipped loop is a workflow violation, not an optimization.

Use broader or specialized declared skills only when the target scope requires them:
- If the plan changes top-level layout, module boundaries, app/service/platform separation, or shared contracts, delegate structural review to `olko-project-architecture`.
- If the plan touches `ai/`, `.agents/`, skill adapters, prompts, templates, or context files, delegate AI-context review to `olko-ai-architecture`.
- If a .NET plan changes `.csproj`, target frameworks, package references, generated code wiring, or build entry points, use `olko-dotnet-build` for feasibility review.
- If a .NET plan creates or changes EF Core migrations/schema, use `olko-dotnet-migration` to shape the migration steps and verification.
- If a .NET plan creates or updates a Wolverine saga, use `olko-create-saga` to shape the saga message flow, timeout, contracts, host wiring, and tests.

### Step 7 - Fold compatible pieces
After the documents are finalized, review the code again for similar existing mechanisms and related functionality, then fold compatible pieces together where possible. Keep both documents aligned.

### Step 8 - Call out structural impact
If the plan changes code structure, call out the impact clearly in the technical document.

### Step 9 - Clean both documents
Remove duplicated material between the business and technical documents. Keep the business document understandable without technical detail and the technical document traceable to business purpose.

### Step 10 - Persist the plan pair
1. Persist both documents before the final reply.
2. Create either missing member of the pair.
3. If the scope changes, update both documents again before the final reply.
4. Never leave either document only in chat if it can be created.

### Step 11 - Caveman mode
While using this skill, respond in strict caveman mode.

### Step 12 - Delegate test execution (optional)
After the plan is approved and implementation is done, if a test skill (e.g. `olko-test`) is declared in `uses`, delegate test execution to it. Provide:
- Path to the technical document (it reads the Tests section to determine scope).
- Any test filter context from the technical document.

If no test skill is declared in `uses`, skip test execution and stop.

## Required output

When finishing, include:

1. Paths to the business and technical documents.
2. Business purpose and mechanism summary.
3. Files to create, grouped by directory.
4. Flow of the application and design patterns used.
5. Tests, with unit tests always and integration tests when applicable.
6. Each test entry must include test name and file/location.
7. Test scope should avoid log-check assertions unless explicitly requested.
8. Suggestions to clarify or alternate design patterns, with pros and cons.
9. External dependencies, only if any new ones are added.
