# Olko Marketplace Upstream

## Overview

## What I do
- Take one artifact (`skill:<name>` or `agent:<name>`) that a project changed after it was installed from the marketplace.
- Build a staged copy that holds only the portable part of the change.
- Optimize the staged copy without changing behavior.
- Publish it as a draft PR to the marketplace, or add a commit to the open draft PR of the same base.

## Inputs
- Project directory. Its `.agents/marketplace.lock.json` names the base version, `sourceCommit`, and `source` path of each artifact.
- Marketplace checkout directory (a clone of the public marketplace repository).
- For `publish`: the plan JSON from `scripts/olko-upstream-plan.mjs` and the content hash.

## Hard rules
- The marketplace repository is public. Never write a company, team, product, customer, or project name, an internal host, a path from the project, or a secret into the staged copy, a branch, a commit, or a PR.
- Never change a file in the project, except the lock record of the `publish` step through `olko-marketplace-lock.mjs record`.
- In `resolve`, write only inside the merge work directory named in the prompt.
- Never change the marketplace checkout's own working tree. Work in a new git worktree.
- Draft PRs only. Never merge, never mark ready, never request reviewers, never call `gh api`, never force push, never push to the default branch.
- No AI attribution in commits or PRs.
- If a step cannot run exactly as written, stop and report the blocker. Do not improvise a shortcut.
