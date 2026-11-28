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

## Resolve: deleted file
- A conflicted file was deleted on one side. Keep it when the other side changed it on purpose and nothing replaces it; delete it only when the removal clearly wins. Either way, mark the hunk `sure: false` so the person decides.

## Resolve: no way to keep both
- The local change and the upstream change contradict each other. Keep the upstream text, describe the dropped local intent in `reason`, and mark it `sure: false`.

## Failed command
- Report the command and its last error lines. Remove a worktree you created. Do not retry with other flags.

## Rules
- Never merge, mark ready, request reviewers, or call `gh api`.
- Never write project values upstream. When unsure whether a hunk is portable, classify it as `adapter`.
