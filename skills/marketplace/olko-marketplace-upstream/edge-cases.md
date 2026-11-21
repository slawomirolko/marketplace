# Olko Marketplace Upstream

## Edge Cases

## Unknown base
- The lock entry has `base: unknown`. Compare with `nearestCommit` and set `baseUnknown: true`. Treat every hunk with care: a difference may be an old version, not a change.

## Upstream moved
- The marketplace has a newer version than the base. Apply the portable hunks on top of the newest version in `<wt>`. When a hunk does not apply cleanly, stop and report the file. Never overwrite newer upstream text with older base text.

## Append
- An open draft PR has the same base. Add one commit to its branch. Never rewrite its history and never force push.

## Only adapter hunks
- Every hunk is `adapter`: the staged copy equals the base. The plan skips it. Report that the change is project-specific and belongs in `project.md`.

## Failed command
- Report the command and its last error lines. Remove a worktree you created. Do not retry with other flags.

## Rules
- Never merge, mark ready, request reviewers, or call `gh api`.
- Never write project values upstream. When unsure whether a hunk is portable, classify it as `adapter`.
