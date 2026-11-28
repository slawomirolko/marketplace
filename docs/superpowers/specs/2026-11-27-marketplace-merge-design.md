# Marketplace merge: bring marketplace updates into changed project copies

## Intent

A project installs marketplace skills and agents and sometimes changes them locally.
Meanwhile the marketplace releases newer versions. Today the person must pick one
side: keep the local change (and stay behind) or take the update (and lose the local
change). Nothing combines both.

This feature merges both sides for every affected artifact of one project, shows the
whole result in one summary, and applies only what the person approves. The portable
part of each local change then goes back to the marketplace as a draft PR through the
existing upstream flow.

Why: collisions happen when the same artifact changes in more than one place. The
person wants one reviewed step that resolves all of them, with a human decision in
the middle, asked once for everything.

## Goals

- Three-way merge per artifact: base (the marketplace commit the project copy came
  from), local (the project copy without its adapter), upstream (marketplace
  `origin/main`).
- Cover every artifact of one project in one run: `modified` with `upstreamMoved`
  (real merge) and `outdated` (plain update, no local change).
- Prepare everything without writing to the project or the marketplace.
- One summary in the viewer with one checkbox per artifact and one "Apply selected"
  action. Nothing is written before that answer.
- After apply: the project copies hold the merged content; the portable local part of
  each applied artifact is offered upstream as a draft PR.

## Non-goals

- Merging across projects in one run (one run = one project).
- A marketplace source checkout as the project (decided by the person): its rows have
  harness `source`, "outdated" there only means the clone is behind `origin/main`, and
  a local change is committed and pushed through a normal PR. "Merge updates" is not
  offered for it; its status keeps the current advice (git pull, or commit and PR).
- Merging `unknown-base` artifacts (no common base; stays a manual comparison).
- Installing `missing` artifacts or deleting `removed` ones.
- Merging or marking PRs ready. Draft PRs only; the person merges or closes them.

## Anti-goals (a failure even if it technically works)

- Any write to the project or the marketplace before the person approves.
- Newer marketplace text silently replaced by older base text.
- Project adapter content (`project.md`, `*.local.*`, the agent `model:` line) changed
  by the merge or sent upstream.
- One question per artifact. The person answers once.
- A conflict resolved by the agent without the person seeing the resolution.

## Constraints

- Public marketplace repo: no company or internal names in code, commits, branches,
  PR text or fixtures. The sanitize gate stays mandatory before anything is pushed.
- Engine rule: the marketplace is the source of truth; workflows are YAML in
  `factory/workflows/`, deterministic work in scripts, no agent-specific TypeScript.
- Existing parts to reuse: `project-scan.mjs` (states, `base` commit, file hashes,
  adapter rules), `olko-marketplace-lock.mjs`, `olko-sanitize.mjs`,
  `olko-upstream-plan.mjs`, the `olko-marketplace-upstream` workflow and agent, the
  viewer's "Waiting for your decision" panel (`Pending.tsx`) and the run answer
  endpoint.
- Today an interrupt question accepts one value from `allowed` (for example `ok` /
  `no`). A per-artifact selection needs a new answer form (see Decided design).

## Approaches considered

1. **Merge script plus an agent only for conflicts** (chosen). A deterministic script
   runs `git merge-file` per file; an agent proposes resolutions only for conflicted
   hunks; the person approves in the viewer; the existing upstream flow publishes.
   Deterministic and testable; the LLM touches only conflicts. Costs a new script and
   a new workflow.
2. **Extend `olko-marketplace-upstream`** so a conflict goes to a resolve step instead
   of stopping, and the rebased result is also copied into the project. Fewer new
   parts, but it mixes two jobs in a publishing agent, and the project only gets the
   update when the upstream run succeeds (a sanitize block would stop the project
   update too).
3. **Agent only**: one agent reads three versions and writes the result. Rejected:
   not deterministic, and it can overwrite newer upstream text.

The person chose direction C: merge into the project copy first, then send the
portable part upstream as a draft PR. Approach 1 was proposed for it and the person
did not object.

## Decided design

### Flow (one run per project)

1. **Collect.** From the project's latest status (or a fresh scan), take every
   artifact with state `outdated`, or `modified` with `upstreamMoved: true`.
2. **Prepare (no writes outside the run's work directory).** For each artifact:
   - `outdated`: the proposed result is the upstream copy; the adapter stays.
   - `modified` + `upstreamMoved`: for each file, three-way merge of base (file at the
     `base` commit), local (project copy, adapter excluded) and upstream (file at the
     fetched `origin/main`). Clean files take the merged text. Files only on one side
     follow that side; a file deleted on one side and changed on the other is a
     conflict.
   - Conflicted hunks go to an agent that proposes a resolution with a one-line
     reason per hunk. Rule: never drop upstream text in favour of base text; keep
     local intent on top of it.
   - Artifacts can be prepared in parallel.
3. **Summary and one question.** The viewer shows one list, one row per artifact:
   name, kind, state, version "local → new" (front matter or registry version; the
   commit only where versions cannot tell the sides apart), files merged cleanly,
   files with conflicts and the proposed resolution as a diff, and what would go
   upstream. Each row has a checkbox, checked by default except rows whose conflict
   resolution the agent marked as unsure. One "Apply selected" button sends the
   answer; "Apply none" ends the run.
4. **Apply.** For the selected rows only: write the merged files into the project
   copies, adapter untouched. Update the project's marketplace lock (when the project
   has one) so the new base is the upstream commit. Then, for each applied artifact
   whose result still differs from upstream, start the existing
   `olko-marketplace-upstream` flow (stage, optimize, sanitize, plan open/append/skip,
   draft PR), one draft PR per artifact as that flow does today.
5. **Report.** Final note in the viewer: applied, skipped, PRs opened or appended,
   anything blocked (for example a sanitize block), and a re-check of the project
   status.

### One approval covers the draft PRs (decided by the person)

"Apply selected" is also the approval for the draft PRs of the applied artifacts. The
merge starts `olko-marketplace-upstream` with a pre-approved input that skips its
`ask-upstream` interrupt. The sanitize gate still runs and still blocks; PRs stay
drafts.

### Base commit (my call)

When the project has a marketplace lock, the lock's `sourceCommit` is the base. Without
a lock, the scan's nearest version is the base, but it is a guess: such a row says
"base guessed" and is unchecked by default.

### Upstream preview (my call)

Because the one answer also covers what goes upstream, prepare runs the upstream
`stage` classification (portable vs project-specific hunks) for each `modified`
artifact, so the row shows the real upstream diff. This costs one agent call per
artifact before the question.

### Copies per artifact (my call)

One row per artifact. When all its installed copies (for example `.claude` and
`.opencode`) are identical, apply writes the merged result to all of them. When they
differ, each copy gets its own row.

### Lock and watch (my call)

Apply records the new base in the project lock (new `record` option for the source
commit and version) and the applied content hash as approved. The
`marketplace-upstream` watch then starts `olko-marketplace-upstream` for it with an
approved input that skips the question; the upstream run records itself as pending
as today. The draft PR therefore starts after the watch's two stable checks (about
20 minutes), not at once.

### Answer form for the selection

Extend interrupt questions with a multi-select form: the question lists item ids and
the answer is the list of selected ids (empty list = apply none). The viewer renders
it as checkboxes plus one button. The answer endpoint keeps its guards (own request
header, local origin, allowed host, runs the viewer process owns).

### Entry point

A "Merge updates" button in the project view next to "Re-check status", enabled when
the latest status has at least one `outdated` or `modified` + `upstreamMoved`
artifact. My call: one button per project, not per row.

### Version source

`olko-marketplace-lock.mjs` reads versions from `registry.json` and
`agents/opencode/index.json`; `project-scan.mjs` reads front matter `version`. The
merge summary needs one source. My call: registry and agent manifest first, front
matter as fallback, applied in `project-scan.mjs` so the status and the merge show
the same versions.

## Left to the builder

- Script name and CLI (for example `scripts/olko-marketplace-merge.mjs` with
  `prepare` and `apply`), and the layout of the run's work directory.
- How the workflow runs one upstream flow per applied artifact (a `map` or
  `subgraph` node if the engine supports it for this case, or a script that starts
  the runs).
- Whether "Merge updates" runs a fresh scan first or trusts a recent status, and the
  age limit for that.
- Test fixtures (reuse the git fixtures in `scripts/project-scan.test.mjs`) and the
  viewer test cases.
