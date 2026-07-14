---
name: olko-commit
description: "Orchestrate the commit workflow: delegate style check, docs staleness, tests, docker rebuild, and PR-description updates to sub-skills, then draft a conventional commit message, resolve branch policy, commit, push, open/update a PR, and optionally merge it. Off main, creates a scope-named branch + PR. With --force, commits directly to main. Triggers: 'commit', 'commit this', 'wrap up', 'summarize changes'."
---

# olko-commit

## Routing Summary
Orchestrate the commit workflow: delegate style check, docs staleness, tests, docker rebuild, and PR-description updates to sub-skills, then draft a conventional commit message, resolve branch policy, commit, push, open/update a PR, and optionally merge it. Off main, creates a scope-named branch + PR. With --force, commits directly to main. Triggers: 'commit', 'commit this', 'wrap up', 'summarize changes'.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path.
- `examples.md` - example outputs, prompts, and command snippets.
- `edge-cases.md` - failure handling, uncommon branches, and rules.
