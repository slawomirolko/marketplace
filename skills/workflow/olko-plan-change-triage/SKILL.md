---
name: olko-plan-change-triage
version: 1.0.0
description: "Task change impact triage and step 8c tracker reconciliation for olko-plan-documentation-orchestrator; load when a material change to a Task's scope appears."
---

# olko-plan-change-triage

Load in `olko-plan-documentation-orchestrator` when a Task plan, readiness finding, grill answer, or blocker decision suggests a material change to a Task's scope, and in step 8c.

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-plan-change-triage/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.

## Procedure

TASK CHANGE IMPACT TRIAGE:
When a Task plan or implementation-readiness finding suggests a material
change to behavior, acceptance criteria, contracts, domain models/value
objects, planned files, path count, prerequisites, delivery order, or safe
independent delivery, delegate read-only triage to
`olko-task-scope-impact-reviewer`. Provide the Feature and Task IDs, current
and proposed Task scope, and verified evidence. The reviewer must inspect the
Feature and every child Task, then return `FEATURE_RECHECK_REQUIRED`,
`TASK_LOCAL_OK`, or `INSUFFICIENT_CONTEXT` with a status for each remaining
Task.

- On `FEATURE_RECHECK_REQUIRED`, route back to `olko-feature-backlog-writer` in
  `draft` mode. Re-evaluate the Feature outcome and every remaining Task for
  scope, acceptance criteria, milestone, domain model/contract touchpoints,
  overlap, dependencies, parallel safety, independent production delivery,
  and the code-path budget (default 15; an explicit developer extension must be
  honored for that Task and PR and is not re-opened). Record which Tasks remain valid and why. Revise or
  split only affected Tasks. If Feature behavior or acceptance changes, review
  the complete Feature Task set; if the Epic boundary or Feature sequence
  changes, review the Epic map too.
- On `TASK_LOCAL_OK`, record the verdict and evidence in `tracker.md` and
  continue the Task plan without revising the Feature or sibling issues.
- On `INSUFFICIENT_CONTEXT`, do not treat the change as local. Obtain the
  missing context or route to a Feature review.

Gather newly exposed user decisions in one batch. Do not recalculate or publish
revised plans or backlog until the batch is answered and its complete
re-validation cycle passes. For existing YouTrack issues, show exact proposed
edits and obtain separate explicit approval before publishing.


STEP 8c:
If grill or blocker decisions or technical findings materially changed
     Task scope, use `olko-task-scope-impact-reviewer` and follow
     TASK CHANGE IMPACT TRIAGE. On `FEATURE_RECHECK_REQUIRED`, delegate
     `olko-feature-backlog-writer` in `draft` mode
     with the final validated plan pair, current issue IDs, and locked decisions.
     Check Feature-criterion coverage, then show the exact proposed issue edits
     and explicitly recommend updating the affected Feature or Tasks. Ask the
     user for separate, explicit approval of this tracker change; do not treat
     grill or plan approval as permission to publish. Only after approval,
     delegate `publish` mode and have the subagent re-read all changed issues.
     If the user declines, leave tracker unchanged and record the mismatch as
     a blocker until the plan is revised or the issue update is approved. If a
     concurrent edit changes the approved delta, show the new diff and obtain
     fresh approval before writing. Record verified issue links in `tracker.md`.
     If reconciliation changes plan scope, re-run the affected implementation
     re-validation loop. Skip this step when changes were purely technical or
     no issue exists.
