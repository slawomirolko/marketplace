# Olko Implement Current Code

## Purpose

Adopt changes that already exist in a checkout and attach them to one approved
YouTrack Task. Transfer them to that Task's worktree when needed, then hand off
to `olko-implementation-orchestrator` for the normal Task delivery flow.

## Use when

- The user asks to continue or adopt changes that are already written.
- The approved Task implementation plan and owning Feature context are available. Feature planning prepares plans for every child Task in one session.
- The changes can be identified as one Task's scope.

Do not use this skill to start implementation from a plan. Use the standard
implementation orchestrator directly for that.

## Hard boundaries

- One invocation adopts changes for one Task and one PR.
- The approved Task implementation plan is required. The Task must belong to a
  Feature, and the Feature delivery tracker is identified or created by the orchestrator.
- Count all distinct changed paths, including tests, migrations, config, and
  both sides of renames. Aim for 5–15 paths when the work supports it; never
  transfer or accept a Task diff over 15 paths. There is no minimum.
- Stop on unrelated changes, scope drift, missing Task/Feature context, an
  ambiguous source file list, or a conflict with the target worktree.
- This skill inventories and transfers files only. It does not edit product
  code or run technical audits, tests, rebuilds, commit, open/merge a PR, or
  delete plans.
- After a successful handoff, the standard orchestrator owns the full flow:
  Task audit and verification, Feature tracking, PR delivery, post-merge
  verification, Task-plan cleanup, and final Feature audit.

## Output

- Task and Feature IDs plus the approved Task plan path.
- Confirmed changed-path list and count against the 15-path limit.
- Source and target worktree paths, with transferred-file results.
- Handoff status and any blocker. Do not claim implementation is complete.
