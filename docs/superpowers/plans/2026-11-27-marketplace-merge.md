# Marketplace Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One factory run per project that three-way merges every outdated or diverged marketplace skill and agent, asks once with one checkbox per artifact, applies the selected merges to the project, and sends the portable part upstream as draft PRs without a second question.

**Architecture:** A deterministic script `scripts/olko-marketplace-merge.mjs` (`prepare`, `apply`) does the git work. A new workflow `olko-marketplace-merge` runs prepare, one agent step for conflicts and upstream classification, one multi-select question, then apply. Apply records the new base and an approved content hash in the project lock; the existing `marketplace-upstream` watch then starts `olko-marketplace-upstream`, which skips its own question for approved content.

**Tech Stack:** Node.js ESM scripts with `node:test`, `git merge-file`; factory engine (TypeScript, `node --test --experimental-strip-types`); viewer (React, vitest, MSW).

**Spec:** `docs/superpowers/specs/2026-11-27-marketplace-merge-design.md`

## Global Constraints

- Public repo: no company or internal names in code, commits, branches, PR text or fixtures.
- No write to the project or the marketplace before the person answers; prepare writes only inside its work directory.
- Never replace newer upstream text with older base text.
- Adapter never changes and never goes upstream: `project.md`, `*.local.*`, the agent `model:` line.
- One question per run. PRs are drafts only; the sanitize gate always runs.
- Rows with harness `source` (marketplace source checkout) are never merged; the "Merge updates" button is not offered for them.
- Engine rule: workflows are YAML; no agent-specific TypeScript.
- Class member order: fields, ctor, props, public, private. No inline `//` prose comment blocks.
- Commit messages: conventional, plain English, no AI attribution.

## Review Focus

- A file deleted upstream and edited locally (or the reverse): must be a conflict row, never a silent delete or resurrection. Test in Task 2.
- CRLF project copy against LF marketplace: must merge cleanly, not conflict on every line. Test in Task 2.
- Agent file where only the `model:` line differs plus an upstream edit: result keeps the project model and takes the upstream edit. Test in Task 2.
- Answer with an id that is not in the list, or an empty answer: rejected by the engine; `none` applies nothing. Test in Task 4.
- Apply run twice with the same answer (viewer retry): second run writes nothing and records nothing new. Test in Task 3.

---

### Task 1: Versions from registry and agent manifest in the status scan

**Files:**
- Modify: `skills/software-factory/olko-factory-project/scripts/project-scan.mjs` (`marketplaceVersions`)
- Modify: `skills/software-factory/olko-factory-project/SKILL.md` (States paragraph on versions)
- Test: `scripts/project-scan.test.mjs`

**Interfaces:**
- Produces: `marketplaceVersions(...)` entries `{ commit, date, version: string|null, files, model }`; `version` = `registry.json` `skills[].version` (skill) or `agents/opencode/index.json` `agents[].version` (agent) at that commit, front matter `version` when the registry has none.

- [ ] **Step 1: Failing test** `"versions come from the registry and the agent manifest, front matter is the fallback"`: fixture writes `registry.json` `{ skills: [{ name: "sample-skill", version: "2.0.0" }] }` and `agents/opencode/index.json` `{ agents: [{ name: "sample-helper", version: "0.3.0" }] }` in the v2 commit; assert `current` of `skill:sample-skill` is `"2.0.0"`, of `agent:sample-helper` is `"0.3.0"`; an artifact absent from both keeps its front matter version.
- [ ] **Step 2:** Run `node --test scripts/project-scan.test.mjs` → the new test fails.
- [ ] **Step 3:** Read both JSON files once per commit with `git show <commit>:<file>` (batch through the existing `readBlobs` when practical); prefer them over front matter.
- [ ] **Step 4:** Run `node --test scripts/project-scan.test.mjs` → all pass.
- [ ] **Step 5:** Commit `fix(factory): read skill and agent versions from the registry and the agent manifest`.

### Task 2: Merge script, `prepare`

**Files:**
- Create: `scripts/olko-marketplace-merge.mjs`
- Test: `scripts/olko-marketplace-merge.test.mjs` (reuse the git fixture style of `scripts/project-scan.test.mjs`)

**Interfaces:**
- Consumes: `projectStatus`, `portableText`, `normalize` from `project-scan.mjs`; `readLock`, `isAdapterFile`, `hashFiles` from `olko-marketplace-lock.mjs`.
- Produces: `prepare({ project, marketplace, out, fetch = true }) -> Plan` and CLI `prepare --project <dir> --marketplace <dir> --out <dir> [--no-fetch] --json` printing the Plan; `Plan` is also written to `<out>/plan.json`:

```ts
type Plan = { project: string; marketplace: string; ref: string; head: string; ids: string[]; conflicts: number; items: Item[] };
type Item = {
  id: string;                 // "skill:x", or "skill:x@<location>" when copies differ
  kind: "skill" | "agent"; name: string; state: "outdated" | "modified";
  locations: string[];        // project-relative copies the result is written to
  base: string;               // full commit
  baseGuessed: boolean;       // true when no lock entry gave sourceCommit
  versions: { local: string|null; upstream: string|null; localCommit: string; upstreamCommit: string };
  files: { path: string; result: "clean" | "upstream" | "local" | "conflict"; conflictKind?: "both-edited" | "deleted-upstream" | "deleted-locally" }[];
  dir: string;                // <out>/<safe id>/ holding the proposed copy (merged files, conflict markers in conflicted ones)
  checked: boolean;           // default of the checkbox: !baseGuessed && conflicts resolved surely (set later by Task 5's step)
};
```

- [ ] **Step 1: Failing tests:**
  - `"outdated takes the upstream copy and keeps the adapter"`: result files equal upstream; `project.md` is not in `dir`; `result: "upstream"`.
  - `"modified with upstream moved merges both sides cleanly"`: local edits `workflow.md` line 1, upstream edits `SKILL.md`; both edits in `dir`; no conflict.
  - `"overlapping edits are a conflict with markers"`: `files[0].result === "conflict"`, `dir` file contains `<<<<<<<`; `plan.conflicts === 1`.
  - `"deleted upstream and edited locally is a conflict"`: `conflictKind: "deleted-upstream"`.
  - `"CRLF project copy merges like LF"`: clean merge.
  - `"agent keeps the project model line"`: result has local `model:` and the upstream body edit.
  - `"lock sourceCommit is the base; without a lock the base is guessed"`.
  - `"identical copies give one item with two locations; different copies give one item each"`.
  - `"source harness, unknown-base, current and modified without upstream move are left out"`.
  - `"prepare writes nothing in the project or the marketplace"`: `git status --porcelain` of both is unchanged.
- [ ] **Step 2:** Run `node --test scripts/olko-marketplace-merge.test.mjs` → fails (module missing).
- [ ] **Step 3:** Implement. Per file: three temp files (base from `git show <base>:<path>`, local normalized with `normalize`, upstream from `git show <ref>:<path>`), `git merge-file -p -L local -L base -L upstream`; exit code > 0 is a conflict. Agents merge their `portableText` and get the local `model:` line put back. Write `.gitattributes`-independent LF output.
- [ ] **Step 4:** Run the test file → all pass.
- [ ] **Step 5:** Commit `feat(factory): prepare three-way merges of marketplace skills and agents`.

### Task 3: Merge script, `apply`, and lock support

**Files:**
- Modify: `scripts/olko-marketplace-merge.mjs`
- Modify: `scripts/olko-marketplace-lock.mjs` (`record`, `status`, CLI)
- Test: `scripts/olko-marketplace-merge.test.mjs`, `scripts/project-change-upstream.test.mjs`

**Interfaces:**
- Consumes: `Plan` from Task 2 (after Task 5 may have edited files in `item.dir` and `resolution.json`).
- Produces:
  - `apply({ out, selected: string[] }) -> { applied: string[]; skipped: string[]; upstream: string[] }` and CLI `apply --out <dir> --selected <ids comma separated | none> --json`. `upstream` lists applied ids whose result differs from upstream.
  - `record(project, artifact, { marketplace, baseCommit, approved })`: CLI `record --project <dir> --marketplace <dir> --artifact <id> --base-commit <sha> [--approved <sha256>]`. `--base-commit` sets `version`, `sourceCommit`, `hash`, `files` from that marketplace commit (creates the entry when missing). `--approved` stores `approved: <sha256>`.
  - `status()` items gain `approved: boolean` (`entry.approved === contentHash`).

- [ ] **Step 1: Failing tests:**
  - `"apply writes only selected items, to every location, adapter untouched"`.
  - `"apply refuses an item whose dir still holds conflict markers"` (throws, writes nothing for any item).
  - `"apply records the new base and the approved hash; lock status reports approved"`.
  - `"apply with none writes nothing"`.
  - `"apply twice with the same answer writes and records nothing new"` (second result: `applied: []`).
  - In `project-change-upstream.test.mjs`: `"record --base-commit creates or moves the base"`.
- [ ] **Step 2:** Run both test files → new tests fail.
- [ ] **Step 3:** Implement. Apply checks every selected `dir` for markers before writing anything. Approved hash = `hashFiles` of the written copy, the same hash `status()` reports as `contentHash`.
- [ ] **Step 4:** Run both test files → all pass.
- [ ] **Step 5:** Commit `feat(factory): apply selected marketplace merges and record their new base`.

### Task 4: Multi-select questions in the engine

**Files:**
- Modify: `factory/src/types.ts` (`Question`), `factory/src/engine.ts` (`answer`, interrupt node rendering), `factory/src/parse-spec.ts` / `workflow-yaml.ts` if they validate question fields
- Test: `factory/test/questions.test.ts`

**Interfaces:**
- Produces: `Question` gains `multiple?: boolean` and `itemsFrom?: string`; `PendingQuestion` gains `items?: { id: string; label: string; detail: string; checked: boolean }[]` read from `state.<itemsFrom>` when the node is rendered. A multiple answer is `none` or ids joined by `,`, each in `allowed`, no duplicates.

- [ ] **Step 1: Failing tests:** `"a multiple question accepts a subset of allowed ids"`, `"…accepts none"`, `"…rejects an unknown id, a duplicate and an empty answer"`, `"…pending question carries its items"`.
- [ ] **Step 2:** Run `node --test --experimental-strip-types test/questions.test.ts` (in `factory`) → fail.
- [ ] **Step 3:** Implement in `answer` and in the interrupt branch next to `allowedFrom`.
- [ ] **Step 4:** Run the test file and `node --test --experimental-strip-types test/spec.test.ts test/parse-spec.test.ts` → pass.
- [ ] **Step 5:** Commit `feat(factory): multi-select questions`.

### Task 5: Workflow `olko-marketplace-merge` and its agent step

**Files:**
- Create: `factory/workflows/olko-marketplace-merge.yaml`
- Modify: `skills/marketplace/olko-marketplace-upstream/SKILL.md`, `workflow.md` (new `resolve` step), `agents/opencode/olko-marketplace-upstream.md` (allow writing in the merge work directory only)
- Modify: `factory/workflows/olko-marketplace-upstream.yaml` (entry `route` node), `factory/config/factory.yaml` (watch input `approved`)
- Test: `factory/test/merge-workflow.test.ts` (scenario style of `test/scenario.ts`), workflow validation test

**Interfaces:**
- Consumes: CLIs from Tasks 2-3; multi-select from Task 4.
- Produces: workflow nodes `prepare` (script, `builtin.exec`, `parse: json`), `nothing` (stop when `prepare.json.ids` is empty), `resolve` (llm, agent `olko-marketplace-upstream`, dirs = work directory only, only when `prepare.json.conflicts > 0` or any item is `modified`), `summary` (script: `merge.mjs summary --out <dir> --json` → `{ ids, items }` with `label`, `detail` = diff and upstream part, `checked`), `ask-merge` (interrupt, `multiple: true`, `allowedFrom: state.summary.json.ids`, `itemsFrom: state.summary.json.items`), `apply` (script). Input: `project`, `marketplace`, `projectId`.
  - `resolve` writes per item `<dir>/resolution.json` `{ hunks: [{ file, reason, sure }], upstream: { portable: string[], adapter: string[] } }` and replaces markers in conflicted files; `summary` sets `checked = !baseGuessed && every hunk sure`.
  - Upstream workflow: new entry `route` (`builtin.pass`) with edges `input.approved == "true"` → `stage`, else → `ask-upstream`. Watch input adds `approved: "{{item.approved}}"`; `skipWhen` unchanged.

- [ ] **Step 1: Failing tests:** scenario `"merge run: no items stops with a note"`, `"merge run: answer none applies nothing"`, `"merge run: selected ids reach apply"` (fake backend for `resolve`); `"upstream run with approved input skips the question"`; existing workflow validation passes for both YAML files.
- [ ] **Step 2:** Run the new test file → fail.
- [ ] **Step 3:** Write the YAML, the `summary` subcommand, the skill `resolve` step (rule: never drop upstream text for base text; mark `sure: false` when unsure), the agent permission, the route node and the watch input.
- [ ] **Step 4:** Run `node --test --experimental-strip-types test/merge-workflow.test.ts test/spec.test.ts` and `node --test scripts/*.test.mjs` → pass.
- [ ] **Step 5:** Commit `feat(factory): marketplace merge workflow with one approval for merges and draft PRs`.

### Task 6: Viewer: "Merge updates" button and checkbox decision

**Files:**
- Modify: `factory/src/config.ts` (`DEFAULT_PROJECTS.mergeWorkflow = "olko-marketplace-merge"`), `factory/app/data.ts` (action `merge` like `analyze`), `factory/app/src/Projects.tsx` (button), `factory/app/src/Pending.tsx` (checkbox form), `factory/app/src/styles.css`
- Test: `factory/app/tests/Projects.test.tsx`, `factory/app/tests/Pending.test.tsx` (create if missing), `factory/test/projects.test.ts`
- Rebuild: `factory/app/dist`, `factory/dist`

**Interfaces:**
- Consumes: `PendingQuestion.items` and `multiple` (Task 4), workflow name (Task 5).
- Produces: POST `/api/projects` `{ action: "merge", id }` → `{ runId, status, reused }`. Button text "Merge updates", next to "Re-check status", enabled when the latest status has an artifact with `harness !== "source"` and (`state === "outdated"` or `state === "modified" && upstreamMoved`). Pending form: one checkbox per item (label, expandable detail), default from `checked`, button "Apply selected" sends ids or `none`, button "Apply none" sends `none`.

- [ ] **Step 1: Failing tests:** `"Merge updates is enabled only with mergeable rows"` (disabled for a source-only status), `"Merge updates starts the merge workflow"`, `"a multiple question renders checkboxes and sends the checked ids"`, `"Apply none sends none"`, API test `"merge action starts olko-marketplace-merge for the project"`.
- [ ] **Step 2:** Run vitest (`node node_modules/vitest/vitest.mjs run` in `factory/app`) and `node --test --experimental-strip-types test/projects.test.ts` (in `factory`) → fail.
- [ ] **Step 3:** Implement; after the merge run finishes, start a status re-check the same way the status button's finish note does.
- [ ] **Step 4:** Run both suites, typecheck (`node ..\node_modules\typescript\bin\tsc -p tsconfig.json` in `factory/app`), rebuild both bundles → pass.
- [ ] **Step 5:** Commit `feat(factory): merge updates from the project view with one checkbox per artifact`.

### Task 7: Docs and live check

**Files:**
- Modify: `docs/project-change-upstream.md` (merge flow section), `skills/software-factory/olko-factory-project/SKILL.md` (pointer)

- [ ] **Step 1:** Document the flow: Merge updates → prepare → resolve → one decision → apply → watch → pre-approved draft PRs.
- [ ] **Step 2:** Live: restart the viewer from the worktree build, run Merge updates on `demo-project`, check the decision list, answer `none`, confirm `git status` of the project is unchanged.
- [ ] **Step 3:** Commit `docs(factory): marketplace merge flow`.
