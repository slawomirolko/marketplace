# Olko Implement Current Code

## What
Transfer current checkout changes into new worktree from latest remote default branch, then verify and finish via commit + merge skills.

## Use When
- User says `olko-implement-current-code`, `implement current code`, or `transfer my session changes to a worktree`.
- Implementation already exists in main checkout during current session.
- User says `resume implement-current-code` or gives worktree path/branch with progress tracker.

## Output
- New worktree branch.
- Local progress tracker: `implement-current-code_<slug>.md`.
- Transferred session files.
- Style/test/rebuild/log verification report.
- Delegated commit and worktree merge when user confirms.

## Uses
This skill delegates only when project adapter declares matching skills in `.agents/skills/olko-implement-current-code/project.md`:

- `olko-worktree-create` for worktree creation.
- `olko-commit-style` or stack style skills for style checks.
- `olko-test` for affected tests.
- `olko-commit` for commit/push/PR workflow.
- `olko-worktree-merge` for merge and cleanup.

## Configuration
Reads `.agents/skill-config.md`, then `.agents/skills/olko-implement-current-code/project.md` when present. Defaults are conservative: no service rebuild, no telemetry endpoint query, delegate only declared `uses`, ask before irreversible actions.
