# Olko Implement New

## What
Implement one accepted Task from its Task-specific implementation plan. The Feature planning session prepares plans for all child Tasks; implementation then runs one Task/PR at a time. Use the existing worktree or create one from the latest remote default branch. Then verify and finish through commit and merge skills.

## Use When
- User says `olko-implement-new`, `implement the Task`, `implement the plan`, or provides Task and Feature context.
- The Task's implementation plan exists in the Feature plan package.
- User says `resume implement-new` or gives worktree path/slug with progress tracker.

## Output
- Reused attached worktree branch or newly created worktree branch.
- Local progress tracker: `implement-new_<plan-slug>.md`.
- Implemented plan changes.
- Style/test/rebuild/log verification report.
- Delegated commit and worktree merge when user confirms.

## Uses
This skill delegates only when project adapter declares matching skills in `.agents/skills/olko-implement-new/project.md`:

- the `worktreeCreateSkill` skill (default `olko-worktree-create`) for current-worktree reuse or worktree creation.
- the `styleSkill` skill (default `olko-commit-style`) or stack style skills for style checks.
- the `testSkill` skill (default `olko-test`) for all tests in affected projects (always delegated — auto-detected when installed even if not in `uses`).
- the `commitSkill` skill (default `olko-commit`) for commit/push/PR workflow.
- the `worktreeMergeSkill` skill (default `olko-worktree-merge`) for merge and cleanup.

## Configuration
Reads `.agents/skill-config.md`, then `.agents/skills/olko-implement-new/project.md` when present. Defaults are conservative: no service rebuild, no telemetry endpoint query, delegate only declared `uses`, ask before irreversible actions.

| Key | Default | Meaning |
|-----|---------|---------|
| `worktreeCreateSkill` | `olko-worktree-create` | Skill that reuses or creates the Task worktree. Must also be declared in `uses`. |
| `styleSkill` | `olko-commit-style` | Skill that checks style on changed files. Must also be declared in `uses`. |
| `testSkill` | `olko-test` | Skill that runs tests in affected projects. |
| `commitSkill` | `olko-commit` | Skill that commits, pushes, and opens or updates the PR. Must also be declared in `uses`. |
| `worktreeMergeSkill` | `olko-worktree-merge` | Skill that merges and cleans up the worktree. Must also be declared in `uses`. |
