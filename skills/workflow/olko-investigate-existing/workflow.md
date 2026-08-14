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

#### Technology architecture and coding style compliance (delegation gate)
Use the relevant `AGENTS.md`, `CODING_STYLE.md`, `ARCHITECTURE.md`, and technology docs discovered by walking the tree from each touched file (and architecture docs when `readArchitectureDocs` is enabled) to verify the mechanism against:

- the solution architecture
- the mechanism's technology architecture
- the coding style rules for the stack
- the local project conventions where the mechanism lives

This step does **not** encode project-specific rules. Check the mechanism against **every rule those docs define**. Flag each violation with the specific rule and the doc `file:line` that defines it. If a rule here ever contradicts a doc, the doc wins — surface the conflict.

If `readArchitectureDocs` or `readTestingDocs` is disabled, do not invent missing rules. Instead, delegate review to matching stack-specific skills declared in `.agents/skills/olko-investigate-existing/project.md`:

| Stack | Architecture | Coding style |
|-------|--------------|--------------|
| .NET | `olko-dotnet-architecture` | `olko-dotnet-style` |
| Docker | — | `olko-docker-style` |
| Python | `olko-python-architecture` | `olko-python-style` |
| Kotlin/Android | `olko-kotlin-architecture` | `olko-kotlin-style` |

Pass the mechanism summary, touched files, flow graph, and known stack context to each matching declared skill. Ask it to review for rule impact only; do not ask it to implement. Fold returned violations, constraints, or review gaps into the investigation summary.

If no matching stack skill is declared in `uses`, fall back to the minimal loaded context (`.agents/skill-config.md`, scoped `AGENTS.md`, and project adapter). State the review gap under architecture/coding style findings.

Use broader declared skills only when the investigated mechanism requires them:
- If the mechanism crosses top-level layout, module boundaries, app/service/platform separation, or shared contracts, delegate structural review to `olko-project-architecture`.
- If the mechanism touches `ai/`, `.agents/`, skill adapters, prompts, templates, or context files, delegate AI-context review to `olko-ai-architecture`.

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

### Architecture and Technology Violations
<each with rule reference (doc file:line or delegated skill) and code file:line>

### Coding Style Violations
<each with rule reference (doc file:line or delegated skill) and code file:line>

### Predicted Errors
<each with scenario, handling, blast radius>

### Test Reuse and Consolidation
<existing tests to modify, parameterize, or merge; genuinely new tests only with justification>
```

After displaying the summary, perform these interactive actions in sequence:

#### 6a-pre — Grill open questions and suggestions (domain + style/arch gate)

For every open question or suggestion surfaced in Step 4 (AGENTS.md updates) and Step 5 (optimization, extension, architecture/technology violations, coding style violations, predicted errors), before presenting any decision options:

1. **Invoke the `grill-with-docs` skill** to stress-test the suggestion against the project's documented domain model (CONTEXT.md glossary, ADRs, AGENTS.md, CODING_STYLE.md, architecture docs). Pass the suggestion text, the touched files, and the Step 3 flow graph as the grilling input. Let `grill-with-docs` run its own interview (its 3-option `question`-tool format) to sharpen terminology and cross-reference the docs; do not override its question format.
2. **Apply extra consideration over style and architecture compliance** for each suggestion: after the domain grilling, cross-check every sharpened suggestion against the stack-specific style/architecture rules discovered in Step 5 (or the declared stack skills in `uses`). A suggestion that clears the domain grilling but violates a style/architecture rule is flagged `domain-OK, style/arch-BLOCK` with the violating rule + doc `file:line` (or delegated-skill source) attached. A suggestion that fails the domain grilling is flagged `domain-BLOCK` with the conflicting doc reference. Attach the flag to the option set in 6a/6c so the user sees it before deciding.
3. **Present the decision using the 4-option format** below — this is `olko-investigate-existing`'s decision format, NOT `grill-with-docs`'s 3-option question format. Use the `question` tool with exactly 4 options; the tool auto-appends a "Type your own answer" field. Each option `description` MUST contain:
   - **3 lines for junior developer explanation** — what this choice does concretely, which files/commands it touches, in plain terms a junior dev can act on without re-reading the investigation.
   - **3 lines for business consequences** — impact on users, release cadence, deployment risk, cost, or product behavior.

The 4 options (replaces the old 3-option `Add to plan` / `Apply now` / `Skip`):

| # | Option | Meaning |
|---|--------|---------|
| 1 | Add to plan | Fold the suggestion into the plan created/updated in 6c (or hold it for the plan). |
| 2 | Apply now | Apply the suggestion immediately. |
| 3 | Skip | Discard the suggestion. |
| 4 | Alternative approach | Adopt a different architecture and/or technology solution to solve the same problem — describe it in the option `description`, then route it through 6c as a new improvement item. |

Option 4 (`Alternative approach`) MUST be a genuine re-design (different middleware, different split boundary, different data store, different messaging pattern, different library, different deployment topology), never a restatement of option 1/2/3. If no real alternative architecture/technology exists for a given suggestion, option 4 may be omitted for that one item and the omission noted ("no viable alternative architecture — option 4 skipped: <one-sentence reason>").

If `grill-with-docs` is **not declared in `uses`**, fall back to manual cross-checking against the docs discovered in Step 5 (universal rule: do not invent rules; state the grilling gap and present the 4 options anyway).

#### 6a — AGENTS.md update confirmation
If Step 4 identified updates, present them using the 4-option format from 6a-pre — one option set per AGENTS.md file (or per coherent batch of updates). Option 1 (`Add to plan`) holds the drafted updates for inclusion as a `## AGENTS.md Updates` section in the plan created in 6c (per file: exact addition) — do not apply now. Option 4 (`Alternative approach`) reframes the AGENTS.md change as a code/structure change that makes the doc update unnecessary (e.g. rename a type so the doc quirk disappears, or move code so the cross-boundary rule no longer applies).

> When a plan file is created/updated in 6c and the user chose option 1, fold the Step 4 updates into that plan as a `## AGENTS.md Updates` section. Do not silently drop them.

#### 6b — Plan mode: new or update?
Ask: "For the improvement items below — create new plans or update existing ones?" Store the answer as `plan_mode`. (If no plan skill is declared in `uses`, skip 6b/6c and go to 6d.)

#### 6c — Improvement items
For each item from Step 5 (optimization, extension, architecture/technology violations, coding style violations, predicted errors), present it using the 4-option format from 6a-pre — one option set per item, processed one at a time. When a plan skill is declared in `uses` and the user picks option 1 (`Add to plan`) or option 4 (`Alternative approach`), delegate plan creation/extension to the plan skill and pass the Step 5 test-reuse analysis in (plans must prefer modifying, parameterizing, or merging existing tests). The plan skill decides the plan file location — do not assume one. If no plan skill is declared, present items in chat only. Option 4 items are added to the plan as new improvement items with their alternative-architecture description.

#### 6d — Auto-update report

Before the closing summary, output an explicit auto-update report. The investigation may have written or modified artifacts (plan files, AGENTS.md sections held for the plan, test-reuse notes folded into a plan). List every such change so the user can audit what the skill touched without re-reading the files.

Format (in chat, before 6e):

```
## Auto-updates made by this investigation

### <artifact path, e.g. docs/plans/foo.md>
- <change 1 — one line, concrete>
  - Why: <one sentence — what was wrong/stale/missing in the prior version that this change fixes>
- <change 2>
  - Why: ...

(repeat per artifact)

## Alternatives considered (2 per material decision)

### Decision: <short label>
1. <Alternative A — what was rejected>
   - Rejected because: <one sentence>
2. <Alternative B — what was rejected>
   - Rejected because: <one sentence>
(Chosen: <what the skill actually did — one sentence>)
```

Rules:
- List **every** file the skill created or modified during this run (plan files, AGENTS.md drafts held in a plan, any scratch file the skill wrote). If the skill only produced a chat summary and touched no files, state "No files modified — chat-only summary."
- Each change line must be concrete (which section/step/line, what was added/removed/reworded) — never "updated plan" or "improved wording."
- The "Why" is the *reason the change was needed*, not a description of the change (e.g. "stale assumption — scaffold split already merged at commit X" not "rewrote Step 5").
- Material decisions = choices that shaped the update and had a viable rejected alternative (scope, format, what to fold vs leave in chat, which test to extend vs create). Trivial edits (typo, line-wrap) do not need alternatives.
- Exactly 2 alternatives per material decision — not 1, not 3. If only 1 real alternative exists, the second is "leave unchanged" with the reason that was rejected.
- If no artifacts were modified, still output the alternatives-considered block for any material decision in the chat summary (e.g. "decided to present findings in chat rather than create a plan — no plan skill declared").

#### 6e — Translate to English

Before producing the final output, translate the entire investigation summary, flow graph, AGENTS.md update drafts, plan edits, auto-update report, and alternatives-considered block into English. This step runs even when the user prompted in another language, when plan/source files are in another language, or when earlier turns of the investigation were written in another language. Preserve all `file:line` references, code identifiers, error codes, and any already-English quotes from source files verbatim — only translate prose. Do not change the structure, ordering, or content of the summary; only the language. The final chat output the user sees MUST be English.

#### 6f — Done
```
Investigation complete. Summary:
  - AGENTS.md files updated: <count or "none">
  - Plans created: <list of plan filenames, or "none — no plan skill declared">
  - Plans updated: <list of plan filenames>
  - Auto-updates reported above (per-file changes + justification + 2 alternatives per material decision)
```
