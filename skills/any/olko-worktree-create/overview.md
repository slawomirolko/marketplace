# Smart Worktree Create

## What I Do
- Determine branch name from active plan context, or ask user when no context exists.
- Fetch latest remote default branch before creating anything.
- Create sibling worktree directory named `<repo>-<branch-slug>`.
- Create local branch from the fetched remote tip and set upstream to that remote default branch.
- Report worktree path, branch name, and base commit.

## When To Use
Use when user says "create worktree", "olko-worktree-create", "worktree-create", "new worktree", "open worktree for this plan", or wants isolated implementation workspace.

## Prerequisites
- Current directory, or parent, is git repository.
- `git` CLI available.
- Remote `origin` exists and is reachable.
- Remote default branch is available through `origin/HEAD`; default expected fallback is `origin/main`.

## Adaptation
- Load `.agents/skill-config.md` when present.
- Load `.agents/skills/olko-worktree-create/project.md` when present and project adapters are enabled.
- Recognized optional keys: `remoteName`, `defaultBranch`, `worktreeParent`, `branchPrefixes`.
- Default behavior: remote `origin`, remote HEAD or `main`, sibling directory beside repo root, prefixes `feature`, `fix`, `issue`, `chore`, `refactor`, `test`, `docs`.
