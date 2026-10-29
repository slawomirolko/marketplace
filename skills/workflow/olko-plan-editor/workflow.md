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

### Step 1 - Select planning mode
For a Feature implementation-planning request, prepare the Feature plan and plans for ALL its current child Tasks in this one planning session. Do not stop after planning the first Task. A request naming one Task alone may revise that Task's existing plan.

#### One Feature planning session
Reuse accepted Feature decisions, business goal, progress map, and dependency/parallelism map. Do not grill the user again about accepted Feature decisions.

- Create or update the shared Feature plan once.
- Create one implementation plan file for every current child Task, all in the same planning session. No current Task may be left without its plan.
- A predecessor dependency is recorded in its Task plan; it does not defer planning that Task until implementation of the predecessor.
- Store task plans at `plans/features/<feature-id>/tasks/<task-id>-implementation.md`. Keep one tasks folder per Feature, never a folder per Task.
- Each Task file covers exactly one Task and one PR. Prefer one technical file per Task; do not create Task business plans or a four-file set for every Task. Mark `Ready for implementation: yes/no` in each Task file so the implementer can start that Task without another Task-planning session.
- If implementation later changes a Task boundary, use the scope-impact review to re-evaluate the Feature and every affected, not-yet-completed Task plan.
- **Plan lifecycle:** when one Task is split, narrowed, or superseded, mark and link only its old Task file. Preserve the shared Feature plan, decision register, and unaffected Task plans.

#### Per-Task implementation plan
Write only that Task's technical delivery contract. Keep it precise and ready to implement. Include:

1. Links to the Task, its Feature, and the accepted Feature plan/tracker.
2. User-visible or independently verifiable outcome and the Feature milestone it advances.
3. Scope, non-goals, and estimated changed paths. The budget counts production code, tests, migrations, and runtime configuration. Documentation and knowledge-base paths are reported separately and excluded from the budget: markdown notes under `docs/` (including `docs/knowledge/`), files under `plans/`, and co-located documentation such as `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md`, and `README.md`. The exclusion never authorizes unrelated documentation churn, and code must never be reclassified as documentation to evade the ceiling. Aim for about 10 code paths and prefer 5–15, with no minimum; do not split a coherent smaller change to meet five. Fifteen code paths is an absolute maximum.
4. Existing domain models and value objects touched, with repository paths and reuse/extend/replace decisions; state why none apply when appropriate.
5. Ordered implementation actions, relevant dependencies and parallelism, and how the PR leaves production in a valid working state, preserves behavior outside its scope, and is accepted without depending on an unfinished successor.
6. Acceptance checks, mapped automated tests, runtime evidence, dependencies, parallel group, and any task-specific open decisions. End with the Task's `Ready for implementation: yes/no` verdict and `## Open items`.

Do not add a repeated business plan, stack inventory, or per-Task tracker. Record execution and merged evidence in the shared Feature tracker. Collect every open question across the Feature and all child Task plans into one batch and present the entire batch together. Wait until every question is answered or closed; then revalidate the complete Feature package and every child Task plan in one cycle, recording which plans remain valid and which need revision. Do not recalculate after each answer. Use the Task scope-impact reviewer if a material change could affect sibling Tasks.

#### Full Feature/Epic plan pair
For a full plan, identify the logical target and resolve two linked files.

- Default new pair: `<stem>-business.md` and `<stem>-technical.md` in the same directory.
- If the user names either member of an existing pair, update both members.
- A project adapter may override this naming or location.
- If the user names a legacy single plan file, do not overwrite it. Create a neighboring pair from its stem unless the user explicitly requests migration.

### Step 2 - Gather minimum context (full plan only)
Gather only the minimum context needed from the repo. When `conventionDiscovery` is `false` and the user has not explicitly requested repo inspection, rely on `.agents/skill-config.md`, `AGENTS.md`, and the Project Adapter only.

### Step 3 - List files to change (full plan only)
Ask for or produce the implementation file list before the technical document is written.

### Step 4 - Draft the business document (full Feature/Epic plan only)
Draft or revise `<stem>-business.md` in business language. Include:

1. Business purpose and problem.
2. Users or business consumers and expected value.
3. Mechanism description: inputs, decisions, outputs, and visible behavior.
4. Scope, non-goals, assumptions, risks, and success criteria.

Do not put file lists, class names, implementation steps, or low-level test details here unless they are required to explain a business boundary.

### Step 5 - Draft the technical document and add tests (full plan only)
Draft or revise `<stem>-technical.md`. Link to the business document and include the files to create or change, application flow, design patterns, tradeoffs, configuration, dependencies, structural impact, implementation steps, and tests.

Add `## Existing domain models and value objects` and `## Implementation readiness` before `## Tests`. The inventory must be based on the current code, cite relevant `file:line` evidence, and record a decision for each affected concept: reuse as-is, extend, create new, or not applicable. Explain the choice and identify the owning bounded slice. Distinguish domain models and value objects from transport contracts, persistence mappings, and UI/API DTOs. If none are affected, say so and explain why. An unverified inventory or an unresolved reuse decision is a BLOCKING open item.

`## Implementation readiness` must state `Ready for implementation: yes/no` and map each item to real evidence or an explicit gap:

1. Existing domain model and value object inventory: inspected source locations, affected types, reuse/extension/new decision, rationale, and owning bounded slice.
2. Architecture pattern and owner: target classes/modules and applicable rules.
3. Dependencies: contracts, DI/composition, packages, configuration, persistence/migration boundary, and external dependencies.
4. Instrumentation design: existing local pattern, code point, log/span/metric/event name, tags, and success/failure coverage.
5. Runtime verification contract: affected service, health/status check, feature trigger, expected logs/traces/metrics, and what cannot be confirmed before code runs.
6. Error readiness: trigger, planned handling, retry/idempotency boundary, blast radius, and validation test.

`Ready for implementation: yes` is allowed only when every item is verified or explicitly user-approved as an exception, AND when the plan carries no BLOCKING open item. A BLOCKING open item is any unanswered user decision, unresolved blocker, unresolved assumption, or open question that could change scope, mechanism, contract, planned files, or acceptance criteria. Add an `## Open items` section to the technical document listing every open item classified as BLOCKING, VERIFY-DURING-WORK, or ACCEPTED-GAP; a `yes` verdict is forbidden while any item is BLOCKING, or while any ACCEPTED-GAP item lacks explicit user acceptance recorded in the tracker. VERIFY-DURING-WORK items are environmental checks resolved by doing the work and may remain under a `yes` only when they cannot change what is built. It is a design-readiness result, never proof that runtime logs, traces, health, or behavior have succeeded.

1. Add a Tests section to the technical document.
2. List unit tests always, and list integration tests when applicable.
3. For each test, include the test name and file/location.
4. Do not make tests focus on log checking or log assertions unless the user explicitly asks for that.
5. If `readTestingDocs` is enabled, read the repo's testing docs to inform test naming and location conventions.

### Step 6 - Review against architecture, style, and test conventions (full plan only)
Use the relevant `AGENTS.md` files (and architecture docs when `readArchitectureDocs` is enabled) to verify the technical document against the solution architecture, coding style, and the local project conventions where the change will land.

If `readArchitectureDocs` or `readTestingDocs` is disabled, do not invent missing rules. Instead, delegate review to matching stack-specific skills declared in `.agents/skills/olko-plan-editor/project.md`:

| Stack | Architecture | Security | Coding style | Test conventions |
|-------|--------------|----------|--------------|------------------|
| .NET | `olko-dotnet-architecture` | `olko-dotnet-security` | `olko-dotnet-style` | `olko-dotnet-testing` |
| Docker | - | - | `olko-docker-style` | - |
| Python | `olko-python-architecture` | - | `olko-python-style` | `olko-python-testing` |
| Kotlin/Android | `olko-kotlin-architecture` | `olko-kotlin-security` | `olko-kotlin-style` | `olko-kotlin-testing` |
| React Native | `olko-react-native-architecture` | `olko-react-native-security` | `olko-react-native-style` | `olko-react-native-testing` |
| React/TypeScript | `olko-react-architecture` | `olko-react-security` | `olko-react-style` | `olko-react-testing` |

Pass the technical draft, target files, and known stack context to each matching declared skill. Ask it to review the plan for rule impact only; do not ask it to implement. Fold returned violations or constraints into the technical document before persisting it. Reflect a changed scope, assumption, or business risk in the business document too.

If no matching stack skill is declared in `uses`, fall back to the minimal loaded context (`.agents/skill-config.md`, scoped `AGENTS.md`, and project adapter). State the gap in the technical document's tradeoffs or assumptions section.

### Step 6b - Validate every Task plan (Feature batch only)
For every child Task file, verify the YouTrack Task and Feature links, its progress milestone, one-PR acceptance, code-path estimate (preferred 5–15, absolute maximum 15, documentation and knowledge-base paths excluded and reported separately), implementation file list, existing domain models/value objects with reuse/extend/create decision and source evidence, tests, runtime proof, dependencies, and parallel-safety. Compare each Task plan with the shared Feature sequence and all sibling boundaries. Record a `PASS`, `REVISE`, or `BLOCKED` result per Task in the Feature planning `tracker.md`. Revise and recheck only failed Task files, but complete this check for every Task before finishing the Feature batch.

### Step 6.5 - BATCHED RE-VALIDATION LOOP (full-plan hard gate)
**Ownership:** The orchestrating agent (for example, `olko-plan-documentation-orchestrator`) enforces this gate. This skill marks where the gate applies. If this skill runs alone, follow the same batch-and-close rule.

**Question handling:** Before asking the user, collect all open questions across the Feature and every child Task that can be answered now. Record and present the complete set together as one batch in `tracker.md`. Wait until all questions are answered or closed before applying answers or recalculating. If answers expose further questions, present the complete follow-up batch together. After the batches close, revalidate the complete Feature plan and every child Task plan in one cycle. Never recalculate between answers.

**Trigger:** After the user answers or resolves every question and follow-up, apply all answers together. Then run one complete re-validation loop for the combined plan, even if the answers confirm the existing scope. Do not run a loop for each answer or before the full question cycle closes.

**Required actions, in order, once per closed batch:**
1. Re-run the readiness/investigation workers (read-only) for every affected slice; they must verify every new/changed claim against the actual codebase with `file:line` evidence.
2. Re-run every applicable stack-specific auditor for the combined scope, including any stack added by the answers.
3. Re-run the business↔technical consistency gate in both directions and reconcile `stack.md` with the final technical scope and dependency declarations.
4. Fold verified findings; if folding changes documents, repeat the complete pass until one pass yields no new findings.
5. Advance to cleanup or a readiness verdict only after the full question cycle closes and this complete pass succeeds. Validate a closed batch before asking a new batch.

**HARD RULES:**
- NEVER declare `Ready for implementation: yes`, close the grill, or report completion while a question is open or a closed batch still needs its full re-validation loop.
- The editing agent's analysis does not replace worker or auditor verification. Treat every claim added while applying decisions as UNVERIFIED until a worker checks it against the code. This includes file lists, removed tables, changed consumers, and fixed identifiers.
- In `tracker.md`, record each question batch, its answers, its closure, and the result of the one complete loop. Skipping or shortening the loop violates the workflow.

Use broader or specialized declared skills only when the target scope requires them:
- If the plan changes top-level layout, module boundaries, app/service/platform separation, or shared contracts, delegate structural review to `olko-project-architecture`.
- If the plan touches `ai/`, `.agents/`, skill adapters, prompts, templates, or context files, delegate AI-context review to `olko-ai-architecture`.
- If a .NET plan changes `.csproj`, target frameworks, package references, generated code wiring, or build entry points, use `olko-dotnet-build` for feasibility review.
- If a .NET plan creates or changes EF Core migrations/schema, use `olko-dotnet-migration` to shape the migration steps and verification.
- If a .NET plan creates or updates a Wolverine saga, use `olko-create-saga` to shape the saga message flow, timeout, contracts, host wiring, and tests.

### Step 7 - Fold compatible pieces (full plan only)
After the documents are finalized, review the code again for similar existing mechanisms and related functionality. Reconcile the domain model/value object inventory with this pass, fold compatible pieces together where possible, and keep both documents aligned. Architecture review alone does not replace this code-backed reuse check.

### Step 8 - Call out structural impact (full plan only)
If the plan changes code structure, call out the impact clearly in the technical document.

### Step 9 - Clean the Feature package and Task plans (Feature batch only)
Remove duplicated material between the shared business and technical documents. Keep the business document understandable without technical detail and the technical document traceable to business purpose. Check every Task plan for duplication of Feature business context and consistency with its Task issue and Feature milestone.

### Step 10 - Persist the complete plan package (Feature batch only)
1. Persist all four shared Feature documents and every current Task plan before the final reply.
2. Create any missing Feature document or Task plan file.
3. If the scope changes, update the Feature package and every affected Task plan before the final reply.
4. Never leave a Task plan only in chat if it can be created.

### Step 11 - Caveman mode
While using this skill, respond in strict caveman mode.

### Step 12 - Delegate test execution (optional)
After the plan is approved and implementation is done, if a test skill (e.g. `olko-test`) is declared in `uses`, delegate test execution to it. Provide:
- Path to the technical document (it reads the Tests section to determine scope).
- Any test filter context from the technical document.

If no test skill is declared in `uses`, skip test execution and stop.

## Required output

When finishing, include:

For Feature planning, report the shared Feature document paths and the implementation-plan path for every child Task, plus each Task's outcome, touched domain models/value objects, planned paths, tests, dependencies, and unresolved questions. For an Epic-only plan, report the business and technical document paths, business purpose, mechanism, design patterns, dependencies, and unresolved blockers.
