# Workflow — follow these steps in order

## Step 1 — Clarify the outcome

Start from a rough idea or an existing Epic, Feature, or Task. Help the user define the intended behavior. Inspect the current app or related issues when useful. Ask only about decisions that evidence cannot resolve, and present all answerable open questions together as one batch. Do not revise or publish a draft while required decisions remain open.

If the request concerns one existing Task, start by refining that Task and the Feature criteria directly affected.

## Step 2 — Recalculate scope after grilling

Once every open question from the grill/recycle loop has been answered and closed, recalculate the affected delivery plan before drafting or publishing tracker changes. Do not treat a grill answer as a local wording change by default.

- Compare the clarified outcome with the prior scope and identify which Feature acceptance criteria, behavior paths, and Task boundaries changed.
- Treat a material change discovered while planning or revising any Task as a Feature-level trigger. Material changes include changes to behavior, acceptance criteria, contracts, domain models/value objects, dependencies, delivery order, parallelizability, or the Task's file estimate.
- Re-evaluate the Feature outcome and every remaining Task against the material change. Check whether each Task's scope, acceptance criteria, milestone, model/contract touchpoints, dependency order, parallel-safety, and PR boundary still hold. Explicitly record which Tasks remain valid and why; revise only affected Tasks. Do not rebuild unaffected Tasks merely because the review was widened.
- Re-evaluate the complete affected Task breakdown: keep, revise, split, combine, resequence, add, or remove Tasks only where the clarified behavior requires it. Preserve unaffected sibling Tasks.
- For every affected Task, verify it remains independently acceptable as one production PR. Estimate all distinct counted code paths from repository evidence; documentation and knowledge-base paths are excluded from the budget (see the PR size rule in Step 5). Aim for 5–15 code paths, with no minimum for a coherent smaller change. The default maximum is 15; an explicit developer request may extend it for one Task. Split or narrow a Task expected to exceed 15 unless the developer explicitly approved an extension; never publish a code-path estimate above 15 without an approved extension, and honor an approved extension in that Task and its single PR.
- Rebuild the Feature's ordered `## Postęp po Taskach` map so every retained or new Task has a truthful post-merge milestone, verification path, and contribution to the Feature goal. Recheck the complete Feature outcome and acceptance criteria after the final Task.
- Maintain a Feature-level dependency and parallelism map: identify prerequisites for each Task, groups that can proceed in parallel, and the reason for every ordering constraint. Recalculate it whenever a material Task change affects dependencies or sequencing.
- Revisit the parent Epic's Feature list and progress map only if the clarified outcome changes the Epic boundary, a Feature's business result, or the Feature sequence. Otherwise preserve the Epic.
- If the clarified scope no longer fits the current Task, widen the review to all Tasks whose boundaries or milestones are affected. This is the exception to the usual rule to leave sibling Tasks alone; do not edit unaffected siblings.
- Keep all newly exposed open questions together in one follow-up batch. Do not recalculate or publish the final draft until the whole batch is answered and closed.
- For existing issues, present the exact edits for every affected issue and obtain the required separate approval before writing. Approval of a grill answer alone is not tracker-edit approval.

If grilling changes Task boundaries or makes the Task too large for one PR, apply this step to the complete affected Task breakdown; leave unaffected sibling Tasks alone.

## Step 3 — Design the Feature

Keep the Feature useful to one developer. Describe:

- The problem, beneficiary, expected user outcome, and scope boundary.
- The business goal: what value the complete Feature should deliver and how success can be recognized. Use a measurable outcome when repository or user evidence supports one; do not invent a baseline, target, or metric.
- The behavior flow from trigger or source to the result the user sees, including meaningful no-data and failure paths.
- Observable acceptance criteria for the normal path and material exceptions; state what can be checked, not which class to build.
- A short manual test list: where the user goes in the app, what they do, and what result they should see. When freshness matters, distinguish the last successful result from an absence of new input.
- The ordered child Tasks and, for each, the progress visible after its PR merges, how that progress can be verified, and which Feature acceptance criteria it advances. Describe cumulative progress through the sequence and the complete outcome after the final Task. A completed Task must deliver an independently verifiable functional increment; logs and metrics alone do not count as visible progress.
- The end-to-end Feature acceptance criteria that establish whether the complete business goal was delivered. Closing every Task alone does not prove that the Feature works.
- Technical verification runs at two levels: audit each Task's own implementation before its PR is delivered; run one cumulative Feature audit only after all child Task PRs merge and their post-merge evidence passes. Do not run the Feature-wide audit after each Task.

Use `## Cel biznesowy`, `## Postęp po Taskach`, and `## Zależności i równoległość` sections in the Feature description. In `Postęp po Taskach`, list Tasks in delivery order and state for each: the expected post-merge behavior, its observable verification, and its contribution to the business goal. In `Zależności i równoległość`, list prerequisites and identify which Tasks can proceed in parallel, with a reason for each ordering constraint. End with the complete Feature outcome and how it will be checked.

Do not invent personas, metrics, deadlines, roles, or ceremonies. Include a measure only when it helps the user decide whether the Feature works. If a decision remains open, name it instead of disguising it as a requirement.

## Step 4 — Design the Epic when needed

Use an Epic when one business outcome spans several independently valuable Features, or when the product area is too broad for one Feature. An Epic groups outcomes and shows their delivery order; it is not one implementation PR. Do not promote a Feature just because it has several Tasks. First check whether the Tasks deliver distinct user outcomes that need separate Features.

Describe the Epic's beneficiary, problem, business goal for the complete group, scope boundary, and end-to-end success conditions. Use `## Cel biznesowy` and `## Postęp po Feature'ach` in the Epic description. In `Postęp po Feature'ach`, order the child Features by delivery sequence and state for each the independently visible result after that Feature is complete, how to verify it, and how it advances the Epic goal. End with the cumulative outcome after all Features and how to verify the business benefit. Keep metrics evidence-based; preserve unresolved decisions and gaps explicitly.

Each child Feature must still have its own `## Cel biznesowy`, `## Postęp po Taskach`, and `## Zależności i równoległość` sections. Its Tasks are one-PR increments, normally targeting about 10 counted code paths and usually staying within 5–15, with a default maximum of 15. A developer-approved extension is recorded in the Task estimate. Epic progress is measured at Feature completion; Feature progress is measured after each Task PR merges.

## Step 5 — Split into Tasks

Split the Feature by behavior that can ship independently. One Task is one production PR. Test and accept it after its merge, without waiting for a later Task. Each PR must leave the production system in a valid working state, preserve existing behavior outside its stated scope, and avoid an incomplete intermediate mechanism. Include the service, contract, storage, UI, test, and observability changes needed for that behavior in the same PR. Do not create a separate Task only for a plan file, tests, observability, or an unfinished shared layer.

Keep each PR small. Aim for about 10 distinct counted code paths; 5–15 is the preferred range. 15 is the default maximum; an explicit developer request may extend it for one Task and PR. There is no minimum, and do not split a coherent change only to reach five paths. Count every tracked path changed by the PR that carries production code, tests, migrations, or runtime configuration, and count both paths in a rename. Documentation and knowledge-base paths are excluded from the budget and reported as a separate `documentation paths` line with their own count: markdown notes under `docs/` (including `docs/knowledge/`), files under `plans/`, and co-located documentation such as `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md`, and `README.md`. An exclusion never authorizes unrelated documentation churn, and code must never be reclassified as documentation to evade the budget. Estimate the count from repository evidence while drafting the Task, and label it as an estimate. If a coherent Task is expected to exceed 15 code paths, split or narrow it into independently acceptable behavior slices unless the developer explicitly approved an extension, which must be honored in that Task and its single PR.

Every Task must advance a milestone in the Feature's `## Postęp po Taskach` section. Describe the capability that will work after this Task's PR merges and how it can be verified. Prefer a user-visible result; for internal capabilities, specify an independent functional check beyond logs or metrics. A Task that only prepares an unfinished shared layer is not a milestone.

Every Task description must contain these concise, concrete items:

- Outcome and scope: the user-visible or independently verifiable change, its boundary, and the Feature acceptance criteria it covers.
- Domain models and value objects: list the existing domain models, aggregates, and value objects the Task reads, changes, or extends, with repository paths and a short note on their role. State whether each is reused, extended, or replaced; list planned new domain types with their intended location. If no domain model or value object is affected, say so and explain why. Base the list on repository evidence, and distinguish domain types from API/transport contracts, persistence mappings, and UI DTOs. Do not omit uncertain items silently; record a blocking gap until verified.
- Feature milestone and PR size: the post-merge capability and how to verify it; estimated distinct counted code paths, aiming for 5–15 and not exceeding 15 unless the developer explicitly approved an extension. Count production code, tests, migrations, runtime configuration, and both paths in a rename; report documentation and knowledge-base paths separately because they do not count toward the budget. Fewer than five code paths is acceptable when the coherent change needs fewer.
- Acceptance criteria: observable pass/fail conditions for the main flow and meaningful no-data or failure paths. Do not substitute implementation steps for acceptance criteria.
- Delivery safety: state how the PR leaves the system working after merge and preserves existing behavior outside the Task scope; include the regression checks relevant to its changed boundaries.
- User test path: where the user starts in the app, what action or input they use, and what result they should see, including how they can tell the result is current when freshness matters.
- Automated test coverage: which main path needs an integration or instrumentation test and which distinct edge or error paths need unit tests, following the repository's testing rules. Map the tests to the Task acceptance criteria; do not prescribe a coverage percentage or duplicate the same flow at both levels.
- Runtime evidence: the user-facing status, history, or result that proves the mechanism ran; add relevant logs, traces, or metrics for diagnosis when needed, but do not make them the user's only verification path.

If a predecessor Task is needed, name it and explain which already-delivered capability this Task uses. The Task must not depend on an unfinished successor for its own acceptance.

Use technical detail only where it defines a boundary or makes a Task independently executable. Do not add PR numbers or issue IDs to issue titles.

## Step 6 — Apply the issue language

Write every Epic, Feature, and Task summary and description in the language the project uses for its issue tracker, regardless of the language of the request or of the caller's prompt. This covers the section headings, prose, acceptance criteria, user test path, automated test coverage, runtime evidence, and any open-decision notes.

Keep all code and technical artifacts in **English**, exactly as written. This includes code, snippets, paths, identifiers, module and package names, frameworks, libraries, services, containers, images, environment variables, config keys and values, CLI commands, API/gRPC/tool names, database objects, and labels such as `AC1` and `FAC1`. Do not translate or transliterate these names.

Before returning or publishing Epic, Feature, or Task text, apply the language profile from `olko-ste100-skill-adapter` that matches the required issue language. For Polish, use the Polish clarity profile; for English, use STE-inspired controlled English. Keep sentences direct and focused. Use domain terms consistently. Make each acceptance criterion, progress step, and verification instruction understandable on its own. Preserve verified meaning and all technical identifiers. Apply this editorial pass before the user reviews the draft, so approval covers the final wording.

## Step 7 — Hand off to implementation planning

Each Task gets its own implementation plan before its implementation starts. One Task = one PR = one plan. When the user requests implementation planning for a Feature, create all child Task plans in that same planning session.

- This skill stops after the accepted backlog. The planning orchestrator then creates the Feature plan and every child Task plan in the same session when implementation planning was requested.
- Do not defer a later Task plan just because an earlier Task must merge first. Record the dependency and any risk; if implementation changes the scope, triage and revise affected plans.
- Each Task plan covers exactly one Task and one PR and inherits the Feature business goal. The Feature description never substitutes for the technical Task file.
- When a Task plan's scope is split or superseded, mark that file as superseded and link to its replacement. Preserve the Feature decision register and unaffected Task plans.

## Step 8 — Two-pass tracker handoff

1. Find the intended project from the caller or an existing issue. Search for matching Epics, Features, and Tasks before creating anything. Read the project's field schema before setting Type or State.
2. Draft either (a) one Feature and its ordered Task list or (b) one Epic, its ordered Features, and each Feature's ordered Task list, in the project's issue language. After grilling, recalculate the affected Task breakdown and Feature progress map only after all open questions are closed. A material change discovered in any Task also triggers a Feature-level review of every remaining Task, its dependencies, and parallelism; state which Tasks remain valid and why, and revise only affected ones. Revisit the Epic only when its Feature outcomes or sequence change. For an Epic, use `## Cel biznesowy` and `## Postęp po Feature'ach`; for each child Feature, use `## Cel biznesowy`, `## Postęp po Taskach`, and an explicit dependency/parallelism map. Verify that every Epic milestone names a Feature-level outcome, while every Task remains independently acceptable as one production PR and does not rely on an unfinished successor. Estimate counted code paths from repository evidence; aim for 5–15 and never exceed 15 without an explicitly approved developer extension that must be honored, reporting documentation and knowledge-base paths separately because they are outside the budget. For an existing Task with missing items, return the missing-item report and exact proposed issue edit. When supplied an approved implementation plan and existing issues, return only the necessary issue changes implied by that plan and the user's locked decisions. Do not write to the tracker during this pass.
3. For a new Epic/Feature/Task breakdown, publish only the draft the user accepted. For any edit to an existing issue, explicitly request separate user approval of the exact proposed tracker edit and named Epic, Feature, or Task. This includes repairs prompted by the Task checklist and changes discovered during implementation-plan grilling; a missing item, grill answer, or approval of plan documents is not enough. Re-read existing issues immediately before writing; if the target changed or a match is ambiguous, return a fresh diff for new approval instead of overwriting it.
4. Publish the accepted hierarchy in order: create or update the Epic, then its Features, then each Feature's Tasks. Link each level as a subtask of its parent. Preserve unrelated description content, comments, links, and existing state. Reuse matching issues on retry. Set each new issue Type to `Epic`, `Feature`, or `Task`, and new Task State to `Open`, only when allowed by the project schema.
5. Read back every changed issue to verify its type, content, parent-child relation, and URL. Report created, updated, reused, and unresolved items.

Use issue descriptions for Epic, Feature, and Task content. Do not turn plan documents into subtasks or attach duplicate plan files.
