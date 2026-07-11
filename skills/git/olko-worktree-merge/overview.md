# Worktree Merge

## What I Do
- Detect current git worktree and branch.
- Ensure work is committed and pushed before PR creation.
- Create or reuse GitHub PR into configured default branch.
- Wait for CI completion and inspect reviews, issue comments, and inline comments.
- Stop for user choice when review feedback or CI failures exist.
- Tear down compose projects started from the worktree before merge.
- Merge PR only through GitHub, never local direct merge.
- Pull updated default branch in main checkout.
- Rebuild configured main compose services affected by changed files.
- Remove worktree and safe-delete merged local branch.

## When To Use
Use when user says "merge worktree", "olko-worktree-merge", "merge this branch to main", "create PR for this worktree", "finish worktree", or "close worktree".

## Prerequisites
- `git` CLI available.
- `gh` CLI installed and authenticated.
- Remote points to GitHub.
- Current directory is a feature worktree, or project adapter declares how to create one.
- Docker available only when compose teardown or rebuild is enabled.

## Adaptation
- Load `.agents/skill-config.md` when present.
- Load `.agents/skills/olko-worktree-merge/project.md` when present and project adapters are enabled.
- Precedence: `.agents/skill-config.md` > project adapter > `AGENTS.md` > marketplace defaults.

Recognized optional keys:

- `remoteName`: git remote name. Default `origin`.
- `defaultBranch`: target branch. Default remote HEAD, then `main`.
- `worktreeCreateSkill`: helper skill name for creating missing worktrees. Default none; ask user instead.
- `commitSkill`: helper skill name for commit/push workflow. Default none; ask user or do minimal git push checks.
- `testSkill`: helper skill name for review-fix validation. Default none.
- `styleCommands`: stack-to-command map for review fixes. Default none.
- `worktreeComposeTeardown`: `true`/`false`. Default `true` when Docker compose project is detected.
- `mainComposeProject`: main docker compose project name. Default none; skip main compose rebuild.
- `mainComposeFile`: compose file path relative to main repo. Default `compose.yaml`.
- `composeServiceMap`: changed-path globs to compose service names. Default empty; skip service rebuild unless adapter supplies mapping.
- `allServicesOnComposeChange`: rebuild all declared compose services when compose file changes. Default `true`.

Default behavior: generic GitHub PR worktree merge. No project-specific service names, paths, or helper skills are assumed.
