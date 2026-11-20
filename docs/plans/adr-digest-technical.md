# ADR digest with `topic` and `overrides`: technical plan

Status: implemented on `feature/adr-digest`. Tested with unit tests and a fake model. Not run against a real project or a real model.

## What was built, and how it differs from the sections below

- `check-store.mjs` also builds the digest (`--digest <path>...`), so selecting the binding ADRs is deterministic. `olko-project-context` runs the script and adds legacy ADRs (no front matter) from the log. It does not match globs itself.
- Glob overlap in the store check is approximate (literal prefix before the first wildcard), as planned.
- `olko-adr-store-reconcile` uses `list.next` loops instead of a `map` node. Each approved batch or group is written right after its approval. A `regroup` step runs the check again after the front matter is written, because ADRs without a topic cannot form groups before that. `verify` runs once, with no loop back. The report lists what is left.
- Overlapping topics never pass silently. The code review, the plan review and the test-first step stop and ask you which ADR binds (or stop). The rules check and the test author then use only the ADR you named. `olko-impl-build` asks again only when the test-first step did not decide. The review reports list the decided topics and suggest `olko-adr-store-reconcile`.
- Violations per store entry: the rules merge step returns `perEntry` (entry and count), and the review reports show it. The counts come from the model, not from a script.
- `olko-impl-tests-first` builds its own digest from the paths the Task plan names (`tests-store-context`). `olko-impl-build` builds a second digest from the chunk files.
- The implementation report states the topics the user decided for the Task only and suggests `olko-adr-store-reconcile`. A unit test renders this prompt from the loaded workflow.
- `check-store.mjs` prints a fix hint (`olko-adr-store-reconcile` or `olko-init-project-docs`) after errors, for CI logs.
- `workflows.lock.json` got only the entry of the new workflow. Other entries were not refreshed: the orchestrator source had already drifted before this change, and that drift needs its own review.

## Goal

A coding agent gets one short list of the binding `MUST` / `MUST NOT` lines for the files of its Task. It does not read every matching ADR in full for every chunk. When several ADRs overlap, a fixed rule picks the binding one. When the rule cannot pick one, the run asks the user. It never guesses.

The project is `input.project`. The store paths come from `<project>/.agents/skill-config.md` (`adrDirectory`, `rulesDirectory`). Nothing in this plan is global to all projects.

The factory engine (`factory/src`) does not change. All changes are in marketplace skills, agents and workflow YAML.

## 1. Store format (marketplace skills)

Every ADR gets front matter:

```yaml
status: Accepted                 # Proposed | Accepted | Deprecated | Superseded
topic: persistence.orm           # the question this ADR answers; dot-separated
scope: ["src/Reports/**"]        # path globs, same as the log Scope column
decision: "Reports module uses Dapper, not EF Core."   # one line
overrides: [ADR-0004]            # optional: broader ADRs this one makes an exception to
supersedes: [ADR-0011]           # optional: ADRs this one replaces
enforcedBy: none                 # none | archtest | lint | ci
```

The ADR log becomes `| ADR | Title | Status | Topic | Scope |`.

Backward compatibility: an ADR without `topic` gets its own id as topic, so it never groups with another ADR. An ADR without `decision` is still read in full, as today.

Files:
- `skills/project/olko-init-project-docs/overview.md`: store format, front matter keys, log columns.
- `skills/project/olko-init-project-docs/workflow.md`: step 3 also confirms `topic`. When an Accepted ADR with the same `topic` and an overlapping `scope` exists, the question offers: supersede it, mark this one as `overrides`, or narrow the scope.
- `skills/project/olko-init-project-docs/examples.md`, `edge-cases.md`: one example with `overrides`, one with `supersedes`.
- `skills/workflow/grill-with-docs/ADR-FORMAT.md`: the same front matter, and the same collision question when it writes a new ADR.

## 2. Store check script (deterministic, no model)

`skills/project/olko-init-project-docs/check-store.mjs` (Node, no dependencies). It reads the ADR front matter and the log, and fails when:
- two `Accepted` ADRs have the same `topic`, overlapping `scope`, and no `overrides` link between them;
- an `overrides` target is not `Accepted`, or its scope is not broader;
- a `supersedes` target does not have status `Superseded`;
- the log row and the front matter disagree;
- `decision` has more than one line.

Glob overlap is approximate: two globs overlap when one literal prefix (the part before the first wildcard) starts with the other. False positives are possible. The script prints them and the user resolves them.

The project can run the script in CI. The `store-context` agent below runs it first.

## 3. New agent `olko-project-context`

`agents/opencode/olko-project-context.md`: hidden, read-only (`edit: deny`, `task: deny`), stack `cross-stack`, registered in `agents/opencode/index.json`. Role `context` in `factory/config/factory.yaml`, tier `low`.

Input: the project path and the Task paths (planned files, or changed paths in a review).

Algorithm:
1. Drop ADRs that are not `Accepted`.
2. Keep ADRs and rule files whose `scope` matches at least one Task path.
3. Group the ADRs by `topic`.
4. In each group, drop every ADR that another ADR in the group lists under `overrides`.
5. If a group still has more than one ADR, record it as `blocked`.
6. Drop lines whose ADR has `enforcedBy` other than `none`, because a test already enforces them.
7. Emit the `decision` line and the `MUST` / `MUST NOT` lines of each remaining ADR, and the matching rule-file lines.

Output: one JSON block `{"digest": [{"source": "ADR-0012", "topic": "...", "line": "..."}], "blocked": [{"topic": "...", "adrs": ["ADR-0004", "ADR-0012"]}], "noStore": false}`. Budget: at most about 1,500 tokens. When the budget is exceeded, the agent reports this and keeps the lines with the narrowest scope first.

## 4. Factory wiring (YAML only)

`factory/workflows/olko-impl-build.yaml`:
- New entry node `store-context` (agent `olko-project-context`, `tools: [read]`, `parse: { json: [digest, blocked, noStore] }`) before `chunker`. Its input is the Task plan's file list.
- New interrupt `ask-store` (`askedBy: store-context`) when `blocked` is not empty. Options per group: pick ADR A, pick ADR B, or stop. The answer goes into the digest for this run only. The run also proposes the store fix (supersede or overrides) for the user to apply later.
- The chunk, `child-check` and test-author prompts start with the digest block, before any chunk-specific text, so the stable part comes first for prompt caching.

`factory/workflows/olko-review-rules.yaml` and `olko-review-plan-rules.yaml`: the same `store-context` node before `rules-check`, run on the changed paths. Both `rules-check` and the verifier receive the digest.

After the YAML changes: run `pnpm sources:lock` and the workflow validation and tests (`pnpm test`, `pnpm test:integration`).

## 5. Agent text changes

Files: `olko-dotnet-implementer.md`, `olko-react-implementer.md`, `olko-react-native-implementer.md`, `olko-mobile-implementer.md`, `olko-army-python-implementer.md`, `olko-test-first-author.md`, `olko-project-rules-check.md`, `olko-review-verifier.md`.

New PROJECT DECISION STORE rule:
- When the prompt has a store digest, use it as the binding list.
- Open a full ADR only to resolve a conflict with the digest, or before you return `Blocked:` about a decision.
- When there is no digest, keep the current behavior: read the log and open the matching `Accepted` ADRs.

## 6. Store cleanup workflow `olko-adr-store-reconcile`

This workflow brings an existing project's ADR store into the new format and resolves overlapping ADRs. It runs once per project, and again later when the store drifts.

Start: `factory_start(workflow: "olko-adr-store-reconcile", input: { project })`. Each run handles one project only.

All writes go to a worktree of the project. The workflow never commits. The user reviews the diff and opens the PR.

New files:
- `factory/workflows/olko-adr-store-reconcile.yaml`: the parent workflow.
- `factory/workflows/olko-adr-store-reconcile-fields.yaml` and `olko-adr-store-reconcile-groups.yaml`: subgraphs called by the parent.
- `agents/opencode/olko-adr-store-reconciler.md`: hidden agent, registered in `agents/opencode/index.json`. It loads `olko-init-project-docs` for the store format, and `grill-with-docs` for the question format.
- The writer step uses the same agent with `tools: [read, edit]`, and edits only inside the store directories of the worktree.

Nodes:

| Node | Kind | Tier | What it does |
|---|---|---|---|
| `workspace` | llm | low | Creates or reuses the project worktree for the store change and records its path. |
| `inventory` | llm, `tools: [read, bash]` | low | Runs `check-store.mjs` in the worktree. Returns `missing` (ADRs without `topic`, `decision` or `enforcedBy`), `groups` (overlapping ADRs) and `errors` (broken relations or log mismatches). |
| `fields-batch` | map over batches of 5 ADRs from `missing` | low | Proposes `topic`, `decision` and `enforcedBy` for each ADR. `enforcedBy` is not `none` only when it names an existing test or lint rule with `file:line`. |
| `ask-fields` | interrupt, `askedBy: fields-batch` | none | One question per batch: approve all, edit an entry (free text), or skip the batch. |
| `group-next` | script `list.next` over `groups`, largest group first | none | Takes the next overlapping group. |
| `group-proposal` | llm | high | Gives 3 options for the group: (1) one new merged ADR that `supersedes` the old ones; (2) `overrides` links from the specific ADRs to the general one; (3) a narrower `scope`. The recommendation comes first, and each option shows the exact text it would write. |
| `ask-group` | interrupt, `askedBy: group-proposal` | none | Choose 1, 2 or 3, skip the group, or stop the run. |
| `apply` | llm, `tools: [read, edit]` | medium | Writes only the approved changes in the worktree: front matter, merged ADRs, `Superseded` statuses and log rows. It never deletes an ADR file. |
| `verify` | llm, `tools: [read, bash]` | low | Runs `check-store.mjs` again. If it fails, the run goes back to `group-next` for the remaining groups (`maxCycleIterations: 3`), and after that it stops with the report. |
| `report` | llm | low | Reports ADR counts before and after, groups resolved and skipped, `errors` left, the worktree path and the changed files, and the digest size in tokens for one sample Task path. |

Edges: `inventory` → `fields-batch` when `missing` is not empty, otherwise → `group-next`. When there are no more groups, `group-next` → `apply`. `apply` → `verify` → `report` → END.

Rules for this workflow:
- Nothing is written before the user approves the exact text.
- One question per batch or per group. A skipped batch or group stays as it is, and the report lists it.
- A merged ADR keeps the `Context` of the old ADRs as a short summary with links to them. The old files stay with status `Superseded`, as Nygard recommends.
- The workflow never names a single source file, class or function in an ADR, which is the existing `olko-init-project-docs` rule.

How it is started and offered:
- The user starts it from the harness. It is not started from a viewer button: the viewer is read-only by design, and only the harness relays questions to the user.
- When a run of `olko-impl-build` or a review ends with `store-context.blocked` not empty, its report suggests the exact `factory_start` call for this project.
- When `check-store.mjs` fails in the project CI, its message names this workflow.

Tests: a fake-backend integration test, `adr-store-reconcile-delegate_integration.test.ts`, with a fixture store. The fixture has 3 ADRs without fields, one group of 3 overlapping ADRs, and one broken `supersedes`. The test checks the question order, that nothing is written before approval, and that `verify` passes after the approved changes.

## 7. Measurement

- Baseline: run `olko-implementation` on 2–3 representative past Tasks before the change, and keep the ledger reports.
- After the change, run the same Tasks again and compare:
  - input tokens of the `olko-impl-build` nodes;
  - the number of `project.*` violations that the verifier confirms;
  - the number of `Blocked:` stops;
  - the cost per run.
- In the run report, count violations per ADR or rule id. An entry with zero violations and `enforcedBy` set is a candidate to drop from the digest.

## Open questions

1. How should `topic` names be chosen: a fixed list per project in `docs/adr/README.md`, or free text checked only for duplicates?
2. Should `check-store.mjs` run in the project CI, or only inside factory runs?
3. When `blocked` happens, should the user's choice be written back to the store right away (with approval), or only reported?
4. For a large store, should the reconcile run handle all groups in one run, or at most N groups per run (for example 5)?
5. Separate from this plan: the delegate backend passes `cwd` only from `run.workspace`, not from `input.project`. Verify this in a real run.

## Assumptions

- The size of the existing project's store is not known. The saving of about 50–70k input tokens per Task is an estimate.
- Using "the narrowest scope wins" and `topic` grouping for ADRs is a proposal. The closest-file rule for nested AGENTS.md is the analogy; no source describes this for ADRs.
