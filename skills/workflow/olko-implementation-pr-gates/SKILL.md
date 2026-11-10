---
name: olko-implementation-pr-gates
version: 1.0.0
description: "Steps 8b (Obsidian knowledge-base gate) and 8c (editor verification gate) of olko-implementation-orchestrator; both must pass before the merge."
---

# olko-implementation-pr-gates

Load in step 8b of `olko-implementation-orchestrator`, after the PR is green.

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-implementation-pr-gates/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.

## Procedure

OBSIDIAN KNOWLEDGE-BASE GATE (STEP 8b):
after the PR-feedback fixes are committed and the PR is green, delegate
`olko-obsidian-knowledge-manager` with this Task's completed implementation plan,
the accepted Feature plan, implementation journal, PR evidence, and any
`## Domain changes` section. It must
compare the completed mechanism against `docs/knowledge` and the active
Obsidian vault, apply the Polish clarity profile from
`olko-ste100-skill-adapter` to the proposed note text, then return the final
create or update proposal. Present that proposal to the user and wait for
explicit approval before the manager changes any Obsidian note. Approval must
cover the final reviewed text. If it changes afterward, present a refreshed
proposal and obtain approval again. On approval, let the manager apply and re-read only the
approved note changes; record its verified paths and result in the journal,
then delegate the final commit to `olko-git-delivery-manager` (Obsidian note
changes are the LAST commit on the feature branch before the PR merge). If the
user declines, the vault is unavailable, or any proposed change remains
unapproved, record the outcome, do NOT merge, and keep the plan until the user
explicitly decides whether to retain or remove it. Never remove a plan while
Obsidian knowledge reconciliation is awaiting approval.

OBLIGATORY EDITOR VERIFICATION GATE (STEP 8c):
OBLIGATORY, never skipped, never waived. After the Obsidian changes
are the final feature-branch commit (8b) and before the merge (9), launch
Visual Studio Code on the WORKTREE directory with
`code --new-window <worktree-absolute-path>` by direct `bash` invocation (do NOT
delegate it to `olko-git-delivery-manager`). Never pass `--wait`; never target
the main checkout; never substitute another editor. If the `code` CLI is absent
or the launch fails, record the exact error as a blocker and do NOT proceed to
merge. Present the opened worktree path to the user and WAIT for explicit
confirmation that the syntax/structure inspection is complete before delegating
the merge. The `code` COMMAND is non-blocking (no `--wait`); the GATE is
blocking — without the user's explicit confirmation the orchestrator stays
blocked and MUST NOT start the merge. Record the command, worktree path, and
user confirmation in the journal.
