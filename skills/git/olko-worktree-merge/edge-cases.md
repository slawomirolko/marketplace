# Worktree Merge Edge Cases

## Strict Rules

- Never run the merge flow from the main checkout unless creating or switching to a worktree first.
- Never merge directly into the target branch locally.
- Always use a GitHub PR.
- Never offer to merge before CI completes and reviews/comments are checked.
- Never auto-merge when review feedback exists; ask the user first.
- Always tear down worktree-side compose projects before deleting the worktree.
- Never delete the worktree before its compose project is torn down.
- Rebuild main compose services only when `mainComposeProject` and service mapping are configured.
- Never force-push to the target branch.
- Never delete a worktree or branch before the PR is confirmed merged.
- Keep the remote branch when the user declines remote branch deletion.
- Do not create markdown or documentation files while executing this merge workflow.
- Remove temporary `.txt` and `.log` files before finishing.

## Explicit Skill Reuse

This skill may coordinate with commit, test, style, or worktree-create helpers only when the project adapter declares them. Do not auto-load skills by guessed names.

Recommended adapter keys:

```text
worktreeCreateSkill: olko-worktree-create
commitSkill: olko-commit
testSkill: olko-test
```

If helper skills are not declared, ask the user before substituting manual commands.

## Merge Conflicts

When `merge-tree` reports conflicts:

1. List conflicting files.
2. Ask whether to rebase onto the fetched target branch.
3. If user agrees, rebase and resolve with normal edit/test/commit flow.
4. Push with `--force-with-lease` only after conflict resolution is complete.
5. If user declines, stop and leave the branch unchanged.

## Compose Teardown Failure

If `docker compose -p <project> down --volumes --remove-orphans` fails because the worktree path is missing, retry from any directory with the project name. If containers remain, list explicit container, network, and volume IDs. Force-remove only after user consent.

## Main Compose Rebuild Failure

If a rebuilt service fails to start, show `docker compose ps` and the last logs for that service. Ask whether to investigate or abort cleanup. Do not patch runtime code as part of this skill.

## Branch Delete Failure

Use `git branch -d` first. If it refuses, report that the branch may contain commits not merged into the target branch. Use `git branch -D` only with explicit user consent.
