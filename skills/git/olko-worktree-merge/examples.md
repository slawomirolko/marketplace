# Worktree Merge Examples

## PR Title Prompt

```text
Proposed PR title: `feat(api): add balance reversal endpoint`
Use this title? (y/n/edit)
```

## CI Failure Prompt

```text
CI check `unit-tests` failed.
Choose: fix / merge anyway / abort
```

## Review Feedback Prompt

```text
Code review feedback received:
- Inline: src/Foo.cs:42 by reviewer - rename method for clarity.
- Bot review: Actionable Suggestions - add null guard in src/Foo.cs.

How to proceed?
1. Address all feedback
2. Address specific comments
3. Merge as-is
4. Abort
```

## Merge Prompt

```text
PR `https://github.com/owner/repo/pull/123` is ready. Merge it yourself on GitHub, or should I merge it with `gh`?
1. I'll merge it myself on GitHub
2. Merge with squash
3. Merge with merge commit
4. Merge with rebase
```

## Completion Report

```text
Merge complete.
  PR:                       https://github.com/owner/repo/pull/123
  Merged into:              main @ abc1234
  Worktree:                 C:\repo-feature-x - removed
  Local branch:             feature/x - deleted
  Remote branch:            feature/x - deleted
  Worktree compose project: repo-feature-x - torn down
  Main compose services:    api, worker - healthy
```
