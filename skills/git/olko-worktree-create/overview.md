# Smart Worktree Create

## What I Do
- Detect whether the agent session already runs in an attached Git worktree and reuse it.
- Determine a branch name from active plan context, or ask the user, only when a new worktree is required.
- Fetch latest remote default branch before creating anything.
- Create a sibling worktree directory named `<repo>-<branch-slug>` only from the primary checkout.
- Create local branch from the fetched remote tip and set upstream to that remote default branch.
- Report worktree path, branch name, and base commit.

## When To Use
Use when the user says "create worktree", "olko-worktree-create", "worktree-create", "new worktree", "open worktree for this plan", or wants an isolated implementation workspace. An existing attached worktree satisfies the request.

## Prerequisites
- Current directory, or parent, is git repository.
- `git` CLI available.
- Remote `origin` exists and is reachable.
- Remote default branch is available through `origin/HEAD`; default expected fallback is `origin/main`.

## Adaptation
- Load `.agents/skill-config.md` when present.
- Load `.agents/skills/olko-worktree-create/project.md` when present and project adapters are enabled.
- Recognized optional keys: `remoteName`, `defaultBranch`, `worktreeParent`, `branchPrefixes`, `planDirectories`.
- Default behavior: remote `origin`, remote HEAD or `main`, sibling directory beside repo root, prefixes `feature`, `fix`, `issue`, `chore`, `refactor`, `test`, `docs`.
