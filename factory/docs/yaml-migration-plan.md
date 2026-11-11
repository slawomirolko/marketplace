# Plan: move the five Olko workflows to factory YAML

Status: in progress. `olko-review` runs from YAML with all three routes: REVIEW in full; PLAN in full (requirements lens in plan mode, verifier, project rules check, store decisions, report); FEEDBACK up to the decisions and replies (CI state, unresolved comments, one assessment and one decision per item, implement question, one reply draft and one post question per reply). Fixing code from comments stops with an error until write-capable agents exist (E9). The per-comment path is covered by unit tests only, because no PR of this repository has review comments. `olko-marketplace-skill-sync` runs from YAML through phases 1–3 (path, bootstrap, safe source, local-only adaptation, comparison, one decision per artifact); applying accepted decisions, publishing and installing stop with an error. Workflows 3–5 are still to do.

## Requirements every migrated workflow keeps

1. Harness-agnostic: any MCP client (Claude Code, OpenCode, Codex, LangGraph) runs the workflow with the same tools. No adapter per harness.
2. The factory owns the loop: it decides the next node, asks the user, and keeps the state. The harness only relays questions and, in delegate mode, runs the offered agent.
3. Roles map to tiers (`low`, `medium`, `high`), never to model names. The tier-to-model map comes from configuration and the user confirms it at start.
4. The factory measures cost itself: every LLM step records input, output, cache-read and cache-write tokens and a priced cost per agent, from the CLI output (`cli` backend) or from the tokens the client submits (`delegate`). A run reports zero `unknown` steps. A harness that cannot report subagent tokens runs the workflow with the `cli` backend.
5. Every response carries the cost footer; budget thresholds 50% info, 80% pause and ask, 100% stop.
6. Every question to the user is a factory question (`waiting_for_user`) with allowed answers; the harness never asks on its own.
7. Every side effect outside the working tree (commit, push, PR, merge, comment, publish, install, issue edit, file delete) needs an explicit user answer in the same run, as the source agent requires.
8. After the run the client shows `viewerUrl`: the whole flow and the cost of each agent.
9. The workflow is a YAML file; code exists only for named operations and parsers.
10. Tests: real integration tests on real repositories and real models (Python through LangGraph, TypeScript through stdio), no fake model, no invented projects. Questions that lead to side effects are answered with the no-side-effect option, and the test checks that nothing happened outside.

## Engine features the five workflows need

| # | Feature | Status | Needed by |
|---|---|---|---|
| E1 | Conditional edges, `END`, loop limit (`maxCycleIterations`) | done | all |
| E2 | `interrupt` node with a fixed question | done | all |
| E3 | Subgraph inlined from another YAML file | done | implementation, plan |
| E4 | Question built from state: text and options from a template, for example a child `Blocked:` item with its 2–3 options, an `ask` verdict, or a per-row sync decision | text and id from a template: done; options from state (`question.allowedFrom`): done | all except review REVIEW route |
| E5 | One step per list item (one comment per finding, one decision per artifact, one apply per row) | done as the `list.next` operation plus a loop edge and `maxVisits`; a `map` node over a subgraph: to do | review, both syncs, implementation |
| E6 | Parallel fan-out: agents of one node run at the same time (cli backend) or are offered together (delegate, `pendingWorkItems`), with a wave limit (`parallel`, default 10) | done | all |
| E7 | Approval gate on an operation (`approval: required`): the engine asks before it runs the op and records the answer | to do | all with side effects |
| E8 | Run workspace: an op sets `state.workspace.cwd` (worktree, marketplace checkout); every later agent and op runs there | partly: input `project` is the run workspace, node `dirs` give an agent extra directories (marketplace checkout); an op that changes the workspace mid-run (worktree): to do | implementation, both syncs |
| E9 | Write access per node (`tools: [read, edit]`): the cli backend passes the matching allowed tools; delegate passes it in `pendingWork` | done (`tools: [read, edit, bash]`, default read) | implementation, plan, syncs |
| E10 | `skill` nodes: an LLM node that loads a named skill instead of a marketplace agent | done: the skill text from `skills/*/<name>/SKILL.md` becomes the agent instructions; its directory is added to `dirs` | plan, implementation, sync |
| E11 | Structured agent output: `parse` per agent format plus a check op that rejects a result and loops back (child-result rules) | parsers exist for review; checks to do | implementation, plan |
| E12 | Memory layer ops (`memory.load`, `memory.persist`) over the agent memory block `.opencode/memory/<agent>.md` | done | review, sync, plan |
| E13 | Workflow call with input mapping (`kind: workflow`, `input:`), not only inline subgraph, so implementation can call the review PLAN/REVIEW route | to do | implementation, plan |
| E14 | Configuration file in YAML (`config/factory.yaml`): roles to tiers, backends, budget, read at start and shown in the proposal; models are proposed per backend and confirmed by the user | done |
| E15 | Marketplace agents without installation: the cli backend gives the CLI the agent definition from `agents/opencode/<name>.md`; delegate `pendingWork` carries `agentInstructions` for any harness | done | all |

## Workflows

### 1. olko-review (finish the port)

Source: `agents/opencode/olko-review-orchestrator.md`. Order: first, because the other workflows call it.

- Route node (op `review.route`): plan text → PLAN; caller is an orchestrator with a diff → REVIEW without posting; PR author is the user (`gh pr view --json author` vs `gh auth status`) → FEEDBACK; else REVIEW (RO:48-55).
- REVIEW: `scope` → `detect` → `memory` (E12, ask on load failure, RO:75) → `lenses` (bugs, stacks, plus `olko-review-requirements-lens` when criteria exist, RO:59,76; parallel E6) → `merge` → `verify` (parallel batches) → `rules-check` (`olko-project-rules-check`, skip on `no-store`, RO:80) → question per violation or `ask` verdict (E4/E5, RO:80) → `rank` → `report` → `ask-post` → `post` one comment per finding with its own approval (E5, RO:90) → `memory.persist` (RO:91).
- FEEDBACK: one node with `olko-review-feedback-handler`; its per-comment decisions become factory questions (E4/E5).
- PLAN: `requirements-lens` (mode plan) → `verify` → `rules-check` → report to the caller (RO:95-99).
- Test: REVIEW on a merged PR of this repository (done for the current part); FEEDBACK and PLAN on a real open PR and a real plan file, answering "skip" to every post or reply.

### 2. olko-marketplace-skill-sync-manager

Source: `agents/opencode/olko-marketplace-skill-sync-manager.md`.

- `resolve-path` op (MSM:27-37), question if a fallback path is used → `memory.load` and `bootstrap` agent in parallel → `safe-source` op (clean tree, `main`, `fetch`, `pull --ff-only`, MSM:42-47) with stop edges → `discover` op → `adapt-local` skill node per skill (E5, E10, MSM:59-65) → `compare` (`olko-marketplace-skill-sync-comparator`, one per artifact, waves E6, MSM:52-57) → `decide` (E5: one question per non-identical artifact with options from its classification, MSM:83-90) → `apply` ops per decision (registry fix, agent installer validation, adapter steps with their own approvals, MSM:93-116, E7) → `publish` (diff shown, approval, `olko-commit`, PR, then leave/wait/merge question, MSM:118-127) → `install` ops (`openskills`, agent installer, MSM:128-139) → `memory.persist`.
- Test: real project and real marketplace checkout; every decision answered `leave`, and the test checks that the marketplace tree and branches did not change.

### 3. olko-claude-sync-manager (plugin olko-sync)

Source: `plugins/olko-sync/agents/olko-claude-sync-manager.md`.

- `state` ops wrapping `sync-state.mjs` (init, target get/set, exclusions, hash, lineage, CSM:17-34) with questions only for missing values → `safe-sources` for both stores (CSM:38-45) → Wave A: 3 inventory agents (E6, max 10 per wave, CSM:49-58) → `match` agent, question per `probable` link (E5) → exclusion check op → Wave B: comparators → `decide` per row (E4/E5, action matrix CSM:67-78) → Wave C: porters in stage folders → question per sanitize finding (E5) → missing-dependency rows loop back to Wave C (E1 limit) → `apply-row` one row at a time with `~/.claude` write approvals (E7, CSM:87-104) → `publish` (approval, branch, PR, merge question, CSM:108-112) → optional consolidator (CSM:118).
- Worker retry rule "retried once alone, then shown in the table" (CSM:54) becomes a loop with limit 2 per worker.
- Test: real Claude marketplace and Olko checkout; every row answered `skip`; check that `~/.claude` and both trees did not change.

### 4. olko-plan-documentation-orchestrator

Source: `agents/opencode/olko-plan-documentation-orchestrator.md`.

- `route` (DISCOVERY, PLANNING, both, PDO:49-62) and entry gate with questions (Epic → which Feature, PDO:55-56).
- DISCOVERY: backlog writer `draft` → review question → `publish` with approval → read-back.
- PLANNING: `context` (backlog writer) → `knowledge` (Obsidian manager, read-only) → step 1 fan-out: business writer plus four investigation workers (E6) → `merge-plan` skill node `olko-plan-editor` (E9, E10) → `stack-md` → `consistency-gate` op with loop back to the editor (E1, PDO:188-207) → stack auditors chosen by named technologies (E6) → `fold-findings` → plan review: call the review PLAN route once per plan file (E13, E5) → `grill` questions one at a time (E4/E5, PDO:247-258) → re-validation loop "until a pass yields no new findings" (PDO:134-135) → `cleanup` → blocker loop (PDO:277-286) → `triage` → `finalize` (Obsidian recommendation, memory persist, `code -n`).
- The source states no numeric limit for its loops; the YAML sets `maxCycleIterations` and, when it is reached, asks the user whether to continue (E4) instead of failing.
- Test: a real Feature of this repository's backlog chosen at the start of the work; publish and issue edits answered "no".

### 5. olko-implementation-orchestrator

Source: `agents/opencode/olko-implementation-orchestrator.md`. Order: last; it calls review and, on missing input, plan documentation.

- `entry-gate` op (Task, criteria, plan present; else call plan documentation, IO:91) → `bootstrap` agent in parallel with discovery → `journal` and `feature-tracker` ops → optional `adopt-current-code` skill node (IO:82-89) → `worktree` op sets the run workspace (E8, IO:95) → `preflight`: four investigation workers in parallel, edge to implementation only when all four return `PASS`, else plan update and rerun (E6, E11, IO:96) → `tests-first` (`olko-test-first-author` per stack, write access E9, IO:97) → `implement-chunks`: map over chunks per stack (E5), implementer with write access, `Test dispute:` / `Edge cases:` / `Blocked:` become questions or loops (IO:98-101) → child-result checks (no inline comments, no workflow files, no main Compose project, IO:64-77) with loop back (E11) → `style` → `tests` (runners in parallel) → `docker-isolated` op with isolation proof (IO:104) → `runtime-verify` → `context-optimize` skill node with approval (IO:106-108) → `scope-gate` op (15 code paths, IO:109) → `task-review`: call olko-review REVIEW route (E13, IO:110), blocking tiers loop back to fixes → `commit-pr` with approval (IO:112) → `pr-check` with "Fix which findings?" (IO:113-115) → `obsidian-gate` with approval (IO:116) → `editor-verify` (`code --new-window`, IO:117) → `merge-cleanup` with approval (IO:119) → `post-merge`, feature audit and feature cleanup with approval (IO:121-123).
- Test: a real Task from this repository's backlog; every commit, push and merge question answered "no"; check that no branch, PR or Compose project outside the isolated one was created.

## Order of work

1. E14 (YAML configuration), E6 (parallel fan-out), E7 (approval gates), E4 and E5 (questions from state, map nodes), E12 (memory), with integration tests on olko-review: finish olko-review.
2. E8, E9, E10: marketplace skill sync.
3. Claude sync (reuses 1–2).
4. E11, E13: plan documentation.
5. Implementation orchestrator.

Each step ends with its real integration tests passing in Python (LangGraph over HTTP MCP) and TypeScript (stdio, delegate), and a run page with the cost of every agent.
