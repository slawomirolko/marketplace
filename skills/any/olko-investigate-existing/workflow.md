# Olko Investigate Existing

## Workflow — follow these steps in order

### Step 1 — Find the mechanism

The user provides a name or description. Search broadly:

1. **Discover file types & project markers** from the repo (when `conventionDiscovery` is enabled) or from config/AGENTS.md — e.g. `*.csproj`, `pyproject.toml`, `build.gradle`, `go.mod`, `package.json`, and the source extensions they imply. Never assume a fixed stack list.
2. **By name**: Search filenames, identifiers (class/method/namespace names), and string literals (configuration keys, queue/saga/route names) across the discovered source files and manifests.
3. **By description**: Derive related terms from the description, then search those terms. Cross-reference `AGENTS.md` files for routing or feature descriptions.
4. **If found exactly**: proceed to Step 2.
5. **If NOT found**: list the closest matches (similar identifiers, namespace segments, feature slices) with their file paths. **Stop here.**

### Step 2 — Analyze behavior

Read the full source code of every class/file involved. Trace:

- Entry points (controllers, message handlers, background services, sagas, HTTP clients, gRPC calls — whatever the repo's stacks expose)
- Orchestration path (message flows, method call chains, DI wiring)
- State changes (database writes, sagas, event publishing)
- Error handling (result types, try/catch, retry/resilience policies, problem details)
- External dependencies (HTTP clients, gRPC, message queues, file I/O)
- Configuration (settings types, config keys, environment variables)
- Tests that cover this mechanism

**Test reuse analysis** — for every touched production or test file, inspect existing tests before proposing new ones:

1. Find tests covering the same class, endpoint, workflow, component, or behavior.
2. Compare Arrange/setup, dependencies, fixtures, and execution path.
3. Decide whether requested coverage fits by: updating an existing assertion, adding a case to an existing parameterized test, parameterizing similar tests, merging tests that share the same Arrange, or creating a new test only when behavior/setup is materially distinct.
4. Apply this analysis to every test tier the repo uses.
5. Record redundant tests in touched files that should be merged as part of the improvement.

If `readTestingDocs` is enabled, read the repo's testing docs to inform conventions before this analysis.

Document the behavior in detail. Note data flow direction, transaction boundaries, and concurrency model.

### Step 3 — Produce flow graph

Output a text-based flow graph showing:

```
[Entry Point]  (file:line)
  └─> [Layer/Project]
       └─> [Directory/FeatureSlice]
            └─> [Class.Method]  (file:line)
                 └─> [Class.Method]  (file:line)
                      └─> [Infrastructure/External]  (file:line)
```

Include every directory (feature slice), class, cross-project boundary, message/saga path, and external call. Use indentation and tree connectors (`├─>`, `└─>`). All references must be real `file:line` from the codebase, never placeholders.

### Step 4 — Verify and update AGENTS.md

Apply the AGENTS.md content methodology from the **declared agents-optimizer skill**, or the universal rule if none is declared. Only suggest non-inferable content.

1. **Find relevant AGENTS.md files**: from each touched file, walk up the directory tree to find the nearest AGENTS.md files (slice-level, layer-level, project-level, repo-root). Do not assume fixed project names.
2. **Check existing documentation**: Does any AGENTS.md already describe this mechanism? Is it accurate? Complete?
3. **Identify gaps — only these categories**:
   - Non-inferable naming quirks (interface name differs from entity, field mappings)
   - Cross-boundary validation rules (logic spanning multiple files)
   - Custom tooling commands (build, migration, format invocation)
   - Optional/nullable service wiring (DI dependencies that may not exist)
   - **Skip**: architectural overviews, property tables, validation rule lists, flow diagrams, file references, dependency lists, test locations — all inferable from code.
4. **Prepare updates**: draft the exact additions per AGENTS.md file. **Do NOT apply yet** — hold for user confirmation in Step 6.
5. If everything is already documented correctly, note that no updates are needed.
6. **Never create an AGENTS.md where none exists — only update existing ones.**

### Step 5 — Assess optimization, extension, and error prediction

Analyze the mechanism for:

#### Optimization opportunities
Redundant queries/round-trips, missing caching, over-fetching/N+1, unnecessary allocations/serialization, batching opportunities, async/await improvements.

#### Extension opportunities
Generalization points, hardcoded values that could become configuration, single-class responsibilities extractable into plugins/strategies, missing telemetry/observability hooks.

#### Test reuse and consolidation
Before suggesting any new test: inspect existing tests in every touched test file; prefer changing/extending existing tests over creating new ones; prefer parameterized cases when Arrange/setup and execution path match; prefer merging old tests sharing Arrange, fixture, mock setup, test host, or instrumentation navigation path. Apply across every test tier the repo uses. Do not merge tests whose Arrange only looks similar but verifies a different workflow. Preserve one clear behavior per case.

For every planned test, label it: `Modify existing` / `Add case to existing parameterized test` / `Merge existing tests` / `New test required`. For `New test required`, state why no existing test can absorb the coverage.

#### Architecture compliance (delegation gate)
This step does **not** encode rules. Read the applicable `AGENTS.md` / `CODING_STYLE.md` / architecture docs discovered by walking the tree from each touched file (and the architecture docs when `readArchitectureDocs` is enabled). Check the mechanism against **every rule those docs define**. Flag each violation with the specific rule and the doc `file:line` that defines it. If a rule here ever contradicts a doc, the doc wins — surface the conflict.

#### Error prediction
Identify potential failure points: external dependency unavailability, timeouts/retry exhaustion, cross-context data inconsistency, race conditions/concurrency, missing input validation, saga timeout/orphaned-state risks, configuration misconfiguration, resource exhaustion, poison-message gaps, idempotency gaps. For each: the triggering scenario, current handling (or lack thereof), blast radius.

### Step 6 — Summary and action

Display a structured summary:

```
## Mechanism: <name>
## Found in: <list of projects/features>

### Flow Graph
<graph from Step 3>

### AGENTS.md Updates Needed
<list of files and what to add, or "None — already documented">

### Optimization Opportunities
<each with file:line references>

### Extension Opportunities
<each with file:line references>

### Architecture Violations
<each with rule reference (doc file:line) and code file:line>

### Predicted Errors
<each with scenario, handling, blast radius>

### Test Reuse and Consolidation
<existing tests to modify, parameterize, or merge; genuinely new tests only with justification>
```

After displaying the summary, perform these interactive actions in sequence:

#### 6a — AGENTS.md update confirmation
If Step 4 identified updates, ask: "Add the AGENTS.md updates to the plan (applied during implementation), apply them now, or skip?" Options: `Add to plan` / `Apply now` / `Skip`.
- `Add to plan`: hold the drafted updates for inclusion as a `## AGENTS.md Updates` section in the plan created in 6c (per file: exact addition). Do not apply now.
- `Apply now`: apply immediately.
- `Skip`: discard.

> When a plan file is created/updated in 6c and the user chose "Add to plan", fold the Step 4 updates into that plan as a `## AGENTS.md Updates` section. Do not silently drop them.

#### 6b — Plan mode: new or update?
Ask: "For the improvement items below — create new plans or update existing ones?" Store the answer as `plan_mode`. (If no plan skill is declared in `uses`, skip 6b/6c and go to 6d.)

#### 6c — Improvement items
For each item from Step 5 (optimization, extension, architecture violations, predicted errors), ask one at a time whether to create a new plan, extend an existing plan, or skip. When a plan skill is declared in `uses`, delegate plan creation/extension to it and pass the Step 5 test-reuse analysis in (plans must prefer modifying, parameterizing, or merging existing tests). The plan skill decides the plan file location — do not assume one. If no plan skill is declared, present items in chat only. Process one at a time.

#### 6d — Done
```
Investigation complete. Summary:
  - AGENTS.md files updated: <count or "none">
  - Plans created: <list of plan filenames, or "none — no plan skill declared">
  - Plans updated: <list of plan filenames>
```
