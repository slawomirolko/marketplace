# Olko Implement Current Code

## Workflow

This is an intake and transfer path only. After the handoff, continue through
`olko-implementation-orchestrator`. Do not run a parallel commit/PR workflow.

### Step 0 — Resolve the Task input

1. Require one YouTrack Task ID, its owning Feature ID, the Task's approved
   implementation plan, and linked Feature plan context.
2. Read scope, affected paths or estimate, domain models/value objects,
   acceptance criteria, dependencies, independent PR outcome, and verification
   from those plans.
3. If the Task plan or Feature context is missing or does not define a safe,
   independently deliverable Task, stop and return to the Feature planning
   session to prepare/revalidate plans for every child Task. Do not transfer or
   alter files until the Task scope is ready.
4. Do not re-grill accepted Feature business decisions. If the existing changes
   expose a material scope or contract change, route to the normal Task-change
   impact review before continuing.

### Step 1 — Inventory existing changes

1. Prefer the current session's explicit changed-file list. If unavailable,
   inspect `git status --short` and the diff in the current checkout.
2. Include modified, added, deleted, and both sides of renamed paths. Exclude
   generated outputs only when the repository rules identify them as generated.
3. Show the paths and ask the user to confirm or correct the list when its
   ownership is ambiguous. Do not absorb unrelated checkout changes.
4. Compare every path and behavior with the Task plan and Feature scope. Count every distinct
   repository path, including tests, migrations, configuration, documentation,
   and both sides of renames.
5. If the changes exceed 15 paths, exceed the Task estimate, include unrelated
   work, or materially differ from the approved plan, stop before transfer.
   Return the evidence to the normal Task scope-impact review and planning
   workflow. Never split or rewrite YouTrack Tasks from this skill.

### Step 2 — Resolve the Task worktree

1. If already in an attached worktree, confirm its branch and recorded Task
   identity match this Task. Reuse it when they match.
2. If the session is in the primary checkout, hand the resolved Task ID, Task
   plan path, Feature ID, and confirmed path list to
   `olko-implementation-orchestrator`.
   It creates or selects the Task worktree through its standard lifecycle
   manager, then resumes this skill with the worktree path and the same Task,
   Task plan, Feature, and path list. If it cannot resume this skill, stop and
   return the intake record; do not start a separate transfer flow.
3. Never create a second worktree when an attached Task worktree already
   exists. Never copy files into the primary checkout as a substitute.

### Step 3 — Transfer without overwriting work

1. Resolve and verify the repository roots. If source and target are the same
   Task worktree, do not copy files; verify the current diff against the
   confirmed path list, then continue to the final status check in this step.
2. Otherwise, compare source and target state for each confirmed path before
   copying.
3. Copy only the confirmed session change into the target worktree. For a
   deletion or rename, apply the deletion only when the target still matches
   the source base version. Count both old and new paths for a rename.
4. If a target file has different work that is not the source base version,
   stop on that path. Report the conflict; do not overwrite or merge it here.
5. Leave the source checkout untouched. When source and target differ, report
   whether the source still contains the changes so the caller knows its state.
6. Run `git status --short` in the target worktree. Confirm that its changed
   paths are limited to the accepted Task scope and remain at or below 15.
7. Do not add explanatory code comments or Task/PR/plan identifiers to source
   code during transfer.

### Step 4 — Hand off to the implementation orchestrator

Return a concise handoff record containing:

- Task and Feature IDs and the technical plan path;
- worktree path and branch;
- confirmed changed paths and actual count;
- transferred, already-present, and conflicting paths;
- scope-check result and remaining blockers.

Then continue with `olko-implementation-orchestrator` using the existing diff
as the implementation result. Do not dispatch implementers for paths already
implemented. The orchestrator must still run its full Task gates: rules and
stack audits, style/tests, isolated runtime and log/trace/DB verification,
15-path PR gate, PR review, merge, post-merge verification, deletion of only
the Task technical plan, and the final Feature audit when all Feature Tasks are
complete.

This skill never commits, pushes, opens or merges a PR, removes plans, or marks
a Task or Feature complete.
