# Smart Worktree Create Edge Cases

## Remote Problems

- If the configured remote does not exist, stop and ask the user to configure it.
- If `git fetch <remote>` fails, stop and report the error.
- Never base the worktree on a stale local branch after fetch failure.
- If `origin/HEAD` is unavailable, use configured `defaultBranch` when present; otherwise use `origin/main` and state the fallback.

## Collision Handling

- Existing worktree for branch: report path and stop. Ask whether to reuse it or pick another branch.
- Existing local branch without worktree: ask whether to use it or pick another branch.
- Existing remote branch without local branch: ask whether to track it or pick another branch.
- Existing target directory that is not an active worktree: stop and ask. Do not overwrite.

## Safety Rules

- Always fetch before creating the worktree.
- Always use fetched remote default branch as base.
- Never delete an existing branch without explicit consent.
- Never overwrite an existing directory.
- Create worktree as sibling of repo root unless project adapter sets `worktreeParent`.
- Do not run tests, style checks, or builds.
- Do not create markdown or documentation files while executing this skill.
