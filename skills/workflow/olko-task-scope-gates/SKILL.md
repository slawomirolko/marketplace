---
name: olko-task-scope-gates
version: 1.0.0
description: "Task-to-PR scope gate with the code-path budget (step 7b), and the procedure for work found outside a Task's scope, for olko-implementation-orchestrator."
---

# olko-task-scope-gates

Load in step 7b of `olko-implementation-orchestrator`, when current-code adoption counts paths, and when a finding or an implementer report shows work outside the Task's criteria.

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-task-scope-gates/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.

## Procedure

TASK-TO-PR SCOPE GATE (step 7b): before you delegate commit/PR delivery, identify the one YouTrack Task, its Feature milestone, and the enclosing Epic outcome. Compare the Task's estimated file budget with the proposed PR diff.

   If the Task, Feature milestone, or estimate is missing, stop and obtain the approved scope. Existing-issue edits need separate issue-level approval.

   PATH BUDGET: the budget counts code paths only. Count every distinct repository path changed from the PR target that carries production code, tests, migrations, or runtime configuration, and count both paths for a rename. Documentation and knowledge-base paths are excluded from the budget and reported as a separate `documentation paths` line with their own count: markdown notes under `docs/` (including `docs/knowledge/`), files under `plans/`, and co-located documentation such as `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md`, and `README.md`. An exclusion never authorizes unrelated documentation churn; every documentation path must still belong to this Task's approved scope.

   Target about 10 code paths; the preferred range is 5–15, with no minimum. Fifteen is the default maximum for counted code paths. An explicit developer request to extend the scope is approval and must be honored: apply the full change in this Task and PR, and record the approved count and the approval in the journal and PR body. Do not re-ask, refuse, split, defer, or renegotiate the extension. Without an explicit extension, stop before commit, push, or PR creation and report the count and all paths, then re-scope through the approved Epic/Feature/Task workflow. Do not move code into documentation paths to evade the budget.

   Recount after every later PR change, including approved knowledge-base edits. Record the Epic outcome, Feature milestone, Task, estimate, actual code-path count, documentation-path count, and gate result in the implementation journal. Each Task maps to one PR. Report that PR URL against its Task.

GAP OUTSIDE THE TASK SCOPE: a finding (or an implementer report) shows work that this Task's criteria do not cover. NEVER create a Task on your own. Load `grill-with-docs` through the `skill` tool and ask the user ONE question in its format — problem, why you ask, exactly 3 options with the recommendation first, the business and change-scope consequence of each option, and a glossary:
   1. extend the current Task (recommended when the gap blocks the next Task);
   2. extend a named existing Task of the same Feature;
   3. create one new Task in the same Feature, for this gap only.
   Inspect the code and the Feature's Tasks first so the options name real Tasks and real paths. Record the answer in the journal before continuing. Then run `olko-task-scope-impact-reviewer` on the chosen change, show the exact issue edit through `olko-feature-backlog-writer` (`draft` mode; for option 3 it reads every existing Task and sets dependencies), and publish only after the user's separate, explicit approval. Re-check the path budget (step 7b) for options 1 and 2; an explicit developer extension is honored. A new Task passes the same entry gate and acceptance-criteria test as any other.
