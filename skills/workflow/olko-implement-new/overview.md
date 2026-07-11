# Olko Implement New

## What
Implement one or more plan files in a fresh worktree from latest remote default branch, then verify and finish via commit + merge skills.

## Use When
- User says `olko-implement-new`, `implement the plan`, or gives plan file paths.
- Plan files came from `olko-plan-editor` or another planning flow.
- User says `resume implement-new` or gives worktree path/slug with progress tracker.

## Output
- New worktree branch.
- Local progress tracker: `implement-new_<plan-slug>.md`.
- Implemented plan changes.
- Style/test/rebuild/log verification report.
- Delegated commit and worktree merge when user confirms.

## Uses
This skill delegates only when project adapter declares matching skills in `.agents/skills/olko-implement-new/project.md`:

- `olko-worktree-create` for worktree creation.
- `olko-commit-style` or stack style skills for style checks.
- `olko-test` for affected tests.
- `olko-commit` for commit/push/PR workflow.
- `olko-worktree-merge` for merge and cleanup.

## Configuration
Reads `.agents/skill-config.md`, then `.agents/skills/olko-implement-new/project.md` when present. Defaults are conservative: no service rebuild, no telemetry endpoint query, delegate only declared `uses`, ask before irreversible actions.
