---
name: olko-worktree-create
description: "Create a git worktree branched from the freshly fetched remote default branch, deriving the branch name from active plan context or asking the user when no context exists. Triggers: 'create worktree', 'olko-worktree-create', 'worktree-create', 'new worktree', 'open worktree for this plan'."
user_invocable: true
---

# olko-worktree-create

## Routing Summary
Create git worktree from fresh `origin/main` or remote default branch. Branch name comes from active plan context when available; otherwise ask user. Triggers: "create worktree", "olko-worktree-create", "worktree-create", "new worktree", "open worktree for this plan".

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and prerequisites.
- `workflow.md` - ordered worktree creation path.
- `examples.md` - prompt and report examples.
- `edge-cases.md` - collision handling and safety rules.
