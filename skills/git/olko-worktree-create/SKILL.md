---
name: olko-worktree-create
description: "Reuse the current attached Git worktree when the session already runs in one; otherwise create a worktree from the freshly fetched remote default branch. Triggers: 'create worktree', 'olko-worktree-create', 'worktree-create', 'new worktree', 'open worktree for this plan'."
user_invocable: true
---

# olko-worktree-create

## Routing Summary
Reuse the session's current attached Git worktree, including an Air-managed worktree. Only when the session is in the primary checkout, create a worktree from fresh `origin/main` or the remote default branch. Branch name comes from active plan context when creation is needed; otherwise ask the user. Triggers: "create worktree", "olko-worktree-create", "worktree-create", "new worktree", "open worktree for this plan".

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
