---
name: olko-investigate-existing
description: Investigate an existing mechanism by name or description — find it, analyze its behavior, map its flow, verify AGENTS.md docs against the docs' own rules, assess optimization/extension opportunities and predict potential errors, then offer to create improvement plans via a declared plan skill. Use when the user wants to understand, document, or improve an existing mechanism in the codebase.
user_invocable: true
---

# Olko Investigate Existing

## What I do
- Find a mechanism by name or description
- Analyze its behavior end-to-end
- Produce a flow graph of directories and classes involved
- Verify and update per-slice AGENTS.md documentation (only non-inferable content)
- Assess optimization/extension opportunities and predict potential errors
- Summarize findings and, for each improvement, offer to create a plan via a declared plan skill

## When to use me
User says "investigate X", "analyze how Y works", "explain the Z flow", "document mechanism A", or invokes `/olko-investigate-existing <name>`.

## Dependencies (uses)

This skill integrates with two optional skills. Declare them in `uses` in the project adapter (`.agents/skills/olko-investigate-existing/project.md`):

```yaml
uses:
  - olko-plan-editor       # delegate improvement-plan creation
  - olko-agents-optimizer  # AGENTS.md content methodology
```

- If a **plan skill** (e.g. `olko-plan-editor`) is declared, delegate plan creation to it (Step 6). If not declared, skip plan creation and present the summary only.
- If an **agents-optimizer skill** (e.g. `olko-agents-optimizer`) is declared, follow its methodology for AGENTS.md content decisions (Step 4). If not declared, apply the universal rule below.
- Universal AGENTS.md rule: only suggest **non-inferable** content (naming quirks, cross-boundary rules, custom tooling commands, optional wiring). Never add overviews, flow diagrams, property tables, dependency lists, file indexes, or test tables.

If neither skill is declared, this skill still runs end-to-end; it skips plan creation and uses the universal AGENTS.md rule. Do not auto-load skills — composition is explicit through `uses`. See [Explicit Skill Reuse](../../docs/explicit-skill-reuse.md).

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `conventionDiscovery` | `false` | When `true`, inspect the repo to infer file types, project markers, and conventions not stated in config or AGENTS.md. When `false`/absent, rely on config + AGENTS.md + the Project Adapter only (user may explicitly request repo inspection for a turn). |
| `readArchitectureDocs` | marketplace default | Hints that architecture/style docs should be read and checked when assessing architecture compliance (Step 5). |
| `readTestingDocs` | marketplace default | Hints that testing docs should be read when assessing test reuse (Step 2 / Step 5). |

Layer control flags are documented in the [Layered Skill Adaptation Pattern](../../docs/layered-skill-adaptation.md). The plan file location is project-specific — never hardcode a path; let the declared plan skill name it or read it from the project adapter.

### Default behavior (when no adapter / no `uses` / no config)

- AGENTS.md verification uses the universal non-inferable-content rule.
- Architecture compliance reads whatever `AGENTS.md` / `CODING_STYLE.md` it discovers by walking the tree.
- No plan files are created; the summary is presented in chat only.

## Resolution order

1. Load `.agents/skill-config.md` (apply marketplace defaults if absent).
2. If `conventionDiscovery == true`, inspect the repo to infer conventions not stated in config. Skip when `false` or absent.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-investigate-existing/project.md`. Skip when `false` or the file is absent.
5. Execute this skill with the accumulated context.

Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.

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

## Rules
- Always read source files before analyzing them — do not guess behavior.
- Discover file types, project markers, and AGENTS.md files from the repo (when `conventionDiscovery` is enabled) or from config/AGENTS.md — never assume a fixed stack list or fixed project names.
- When listing closest matches on a miss, include file paths.
- The flow graph must use real `file:line` references from the codebase, never placeholders.
- Do not create plans without user confirmation.
- Before planning new tests, prove existing tests cannot be modified, parameterized, or merged to cover the behavior.
- Prefer merging tests with the same Arrange across every test tier the repo uses.
- Include merge opportunities from touched test files in improvement plans; do not append duplicate tests beside them.
- Architecture compliance rules come from the repo's docs, not from this skill; cite the doc `file:line` for every violation.
- Never create an AGENTS.md where none exists — only update existing ones.
- Only suggest non-inferable AGENTS.md content (skip overviews, flow diagrams, property tables, dependency lists, file indexes, test locations).
- Remove any temp files created during the investigation.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
- Never hardcode project-specific behavior — put it in config or the project adapter.
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-investigate-existing/project.md`.
