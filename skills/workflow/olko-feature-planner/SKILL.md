---
name: olko-feature-planner
description: Turn a rough product idea or an existing tracker issue into a user-facing Feature and independently testable, one-PR Tasks. Use for behavior flow, acceptance criteria, user checks, and backlog breakdown; not for technical implementation plans.
---

# Feature and Task planning

Use this skill from the delegated Feature/Task subagent. Start from a rough idea, an existing Feature, or an existing Task. No issue ID or implementation plan is required. Help the user find the intended behavior through a short conversation and inspect the current app or related issues when relevant. Ask only for decisions that cannot be inferred from the evidence. Do not write implementation plans or production code. In `context` mode, only read the supplied issue and its parent or child relationships and return the relevant scope and acceptance criteria to the caller. If it is an existing Task, also report missing required sections and recommend a separate, approval-gated repair; do not draft or write issues in `context` mode.

## Language

Write every Feature and Task summary and description in the language the project uses for its issue tracker, regardless of the language of the request or of the caller's prompt. This covers the section headings, prose, acceptance criteria, user test path, automated test coverage, runtime evidence, and any open-decision notes.

Keep every code and technical artifact in **English**, verbatim and untranslated: code and snippets, file and directory paths, class/function/method/variable/parameter names, module and package names, frameworks and libraries, service/container/image names, env var names, config keys and values, CLI commands, API/gRPC/tool names, database objects, and labels such as `AC1` and `FAC1`. Never invent localized equivalents, transliterations, or translations for identifiers.

## Feature

Keep the Feature useful to one developer. Describe:

- The problem, beneficiary, expected user outcome, and scope boundary.
- The behavior flow from trigger or source to the result the user sees, including meaningful no-data and failure paths.
- Observable acceptance criteria for the normal path and material exceptions; state what can be checked, not which class to build.
- A short manual test list: where the user goes in the app, what they do, and what result they should see. When freshness matters, distinguish the last successful result from an absence of new input.
- The child Tasks and the acceptance criteria each delivers. Closing every Task alone does not prove that the Feature works.

Do not invent personas, metrics, deadlines, roles, or ceremonies. Include a measure only when it helps the user decide whether the Feature works. If a decision remains open, name it instead of disguising it as a requirement.

## Tasks

Split the Feature by independently deliverable behavior. One Task is one production PR that can be tested and accepted after its own merge, without waiting for a later Task. Include all necessary service, contract, storage, UI, test, and observability changes in that PR. Do not create separate Tasks merely for a plan file, tests, observability, or an unfinished shared layer.

Every Task description must contain these concise, concrete items:

- Outcome and scope: the user-visible or independently verifiable change, its boundary, and the Feature acceptance criteria it covers.
- Acceptance criteria: observable pass/fail conditions for the main flow and meaningful no-data or failure paths. Do not substitute implementation steps for acceptance criteria.
- User test path: where the user starts in the app, what action or input they use, and what result they should see, including how they can tell the result is current when freshness matters.
- Automated test coverage: which main path needs an integration or instrumentation test and which distinct edge or error paths need unit tests, following the repository's testing rules. Map the tests to the Task acceptance criteria; do not prescribe a coverage percentage or duplicate the same flow at both levels.
- Runtime evidence: the user-facing status, history, or result that proves the mechanism ran; add relevant logs, traces, or metrics for diagnosis when needed, but do not make them the user's only verification path.

If a predecessor Task is needed, name it and explain which already-delivered capability this Task uses. The Task must not depend on an unfinished successor for its own acceptance.

When the request concerns one existing Task, refine that Task and only the Feature criteria directly affected; leave sibling Tasks alone.

For an existing Task, check its current description against the required items before drafting anything new. If an item is missing, tell the user which requirement is unmet and propose an exact issue-level edit. Explicitly ask whether to update that named Task and wait for the user's separate approval of the proposed edit. A missing item, a request to inspect the Task, a grill answer, or plan approval is never permission to change an existing issue. If approval is declined, leave the issue unchanged and report the missing items.

Use technical detail only where it defines a boundary or makes a Task independently executable. Do not propose shadow runs, A/B paths, or a default-off replacement mechanism. Do not add PR numbers or issue IDs to issue titles.

## Task example and review checklist

Use these five short sections in each Task description. The headings and prose follow the project's issue language; code identifiers, paths, and names stay English (see Language). This illustrative Task is one independently verifiable PR:

```markdown
## Outcome and PR
- Outcome: The app shows the last completed analysis and the time of its result.
- PR: One production PR covering the API response and the visible app state.
- Independence: The result can be accepted after this PR, without waiting for a later task.

## Acceptance criteria
- AC1: After a completed analysis, the app shows its result and the result time.
- AC2: When no newer analysis exists, the app keeps the last result and shows that no new data arrived.
- AC3: When the refresh fails, the app keeps the last result and shows the error state.

## User test path
- AC1: Start: Open the analysis screen; Action: Refresh after a completed run; Expected result: A new result and its time appear.
- AC2: Start: Open the screen with no newer run; Action: Refresh; Expected result: The previous result and the no-new-data state stay visible.
- AC3: Start: Open the screen when the refresh fails; Action: Refresh; Expected result: The previous result and the error state stay visible.

## Automated test coverage
- AC1: Integration: A completed run is returned by the API; Instrumentation: The app renders the result and its time.
- AC2: Unit: No new run keeps the last result and sets the no-new-data state.
- AC3: Unit: A failed refresh keeps the last result and sets the error state.

## Runtime evidence
- User: The screen shows the last completed result, its time, and the current refresh state.
- Diagnostics: A failed refresh records the run identifier and the failure reason.
```

An incomplete Task such as `AC1: Show the result` with no user test path, automated test mapping, or user-visible runtime evidence must be returned for revision. Do not publish it or silently repair an existing issue.

Before presenting or publishing a Task, review its description and explicitly report any missing item:

1. Does the outcome fit one production PR and remain independently acceptable without a later Task?
2. Does the Task have observable acceptance criteria for the main path and meaningful no-data or failure paths?
3. Does every criterion have a user test path with a starting point, action, and expected visible result?
4. Does every criterion map to an appropriate automated test scenario, without duplicating the same flow at multiple test levels?
5. Can the user see evidence that the mechanism ran, rather than relying only on logs or metrics?

If any answer is no, revise a new Task before publication. For an existing Task, show the missing items and the exact proposed edit, then ask for separate, explicit user approval before changing the issue. Do not impose a numeric coverage gate.

## Two-pass tracker handoff

1. Find the intended project from the caller or an existing issue. Search for matching Features and Tasks before creating anything. Read the project's field schema before setting Type or State.
2. Draft the Feature and an ordered Task list in the project's issue language. Check that the Tasks cover every Feature acceptance criterion and that every Task passes the review checklist and can be tested and accepted without another unfinished Task. For an existing Task with missing items, return the missing-item report and exact proposed issue edit. When supplied an approved implementation plan and existing issues, return only the Feature/Task changes implied by that plan and the user's locked decisions. Do not write to the tracker during this pass.
3. For a new Feature/Task breakdown, publish only the draft the user accepted. For any edit to an existing issue, explicitly request separate user approval of the exact proposed tracker edit and named Feature or Task. This includes repairs prompted by the Task checklist and changes discovered during implementation-plan grilling; a missing item, grill answer, or approval of plan documents is not enough. Re-read existing issues immediately before writing; if the target changed or a match is ambiguous, return a fresh diff for new approval instead of overwriting it.
4. Create or update the Feature, then its Tasks, and link each Task as a subtask. Preserve unrelated description content, comments, links, and existing state. Reuse matching issues on retry. Set new issue Type to `Feature` or `Task`, and new Task State to `Open`, only when allowed by the project schema.
5. Read back every changed issue to verify its type, content, parent-child relation, and URL. Report created, updated, reused, and unresolved items.

Use issue descriptions for Feature and Task content. Do not turn plan documents into subtasks or attach duplicate plan files.
