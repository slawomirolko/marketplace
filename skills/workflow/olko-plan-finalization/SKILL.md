---
name: olko-plan-finalization
version: 1.0.0
description: "Final steps 9–11 and the completion report of olko-plan-documentation-orchestrator: Domain changes recommendation, memory persist, opening the plan directory."
---

# olko-plan-finalization

Load in `olko-plan-documentation-orchestrator` after the final consistency gate and grill approval.

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-plan-finalization/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.

## Procedure

9. After the final consistency gate and grill approval, call
    `olko-obsidian-knowledge-manager` as the last delegated agent. Give it the
    approved Feature/Epic plan pair and ask for the write-free post-implementation Obsidian
    recommendation. Then add or replace a `## Domain changes` section in
    `business.md` using its verified result. The section must list the affected
    Obsidian note paths, whether each needs creation or an update, the related
    implemented mechanism, and that actual vault changes remain separately
    approval-gated. This is the sole exception to the business-writer-only rule:
    the orchestrator may edit only this final section. The `## Domain changes`
    section is a WRITE-FREE RECOMMENDATION ONLY — it is part of the plan, but
    the orchestrator has NO permission to apply, schedule, or delegate any
    Obsidian vault change during plan creation. Vault changes happen ONLY after
    the implementation phase, as a separate, explicitly approval-gated step.
    Never make Obsidian vault changes during plan creation.
10. Persist verified flow improvements through `olko-memory-layer`. Target ONLY
    your own block: `.opencode/memory/olko-plan-documentation-orchestrator.md`
    (plugin `opencode-agent-memory`, label `olko-plan-documentation-orchestrator`).
    This step is REQUIRED. Attempt the persist in this order:
    a. If the memory plugin's `memory_set` / `memory_replace` tool is exposed in
       this session, write the block with it.
    b. Otherwise DELEGATE the block write to a subagent that has unrestricted
       `edit` permission (a stack auditor or an implementer), handing it the
       exact lines to append or merge.
    c. Only if BOTH (a) and (b) are unavailable or fail may the persist be
       reported as skipped — and the report must state which attempts were made.
    NEVER report "skipped" without attempting (a) and then (b). Do not substitute
    a fallback record in the plan documents or `tracker.md` for a real persist.
    Then update `tracker.md` gate status to reflect grill approval and the
    persist outcome (done / skipped-with-attempts).
11. FINAL STEP (user rule 2026-10-17): for a full Feature/Epic plan, once the four shared Feature files, all Task plans, and memory persist are done and `tracker.md` is updated, open the plan directory in Visual Studio Code using a RELATIVE path from the working directory — never a hard-coded absolute path: `code -n plans/features/<feature-id>` for a Feature, or `code -n plans/<plan-name>` for an Epic. Only permitted shell
    command (`bash: "code *"`). If it fails once, print the same relative command
    for the user and finish — never block or retry.


COMPLETION REPORT:
For Epic/Feature/Task discovery, report the accepted Epic, Feature, and Task links, coverage
of acceptance criteria, and any unresolved item; do not imply that implementation
documents or readiness checks were completed. For a Task-only revision, report the updated Task plan path and affected sibling review. For full Feature planning, include all four shared Feature paths and every Task plan path, the `business.md` `## Domain changes` result (write-free
recommendation) and its pending Obsidian approval status — vault changes are
NOT applied during plan creation and happen only after the implementation
phase, as a separate approval-gated step, the
consistency result or each resolved mismatch, grill approval, auditors selected
or skipped with reasons, whether either document changed, evidence-backed
findings, and unresolved blockers.
