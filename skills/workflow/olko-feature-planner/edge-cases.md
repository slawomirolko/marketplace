# Edge cases and strict rules

## `context` mode

In `context` mode, read only the supplied issue and its parent or child issues. Return the relevant scope and acceptance criteria to the caller. For an existing Task, also report missing required sections and recommend a separate, approval-gated repair. Do not draft or write issues in `context` mode.

## Existing Tasks

For an existing Task, check its current description against the required items before drafting anything new. If an item is missing, tell the user which requirement is unmet and propose an exact issue-level edit. Explicitly ask whether to update that named Task and wait for the user's separate approval of the proposed edit.

A missing item, a request to inspect the Task, a grill answer, or plan approval is never permission to change an existing issue. If approval is declined, leave the issue unchanged and report the missing items.

## Task review checklist

Before presenting or publishing a Task, review its description and explicitly report any missing item:

1. Does the outcome fit one production PR and remain independently acceptable without a later Task?
2. Does the Task advance a named Feature milestone with a verifiable post-merge capability?
3. Is the distinct counted-code-path estimate grounded in repository evidence, ideally 5–15 code paths, and at most 15 unless the developer explicitly approved an extension?
4. Does the Task identify affected existing domain models, aggregates, and value objects with repository evidence, explain reuse/extension/new decisions, and state why if none apply?
5. Does the Task leave the system in a valid working state after merge and preserve existing behavior outside its scope, with relevant regression checks?
6. Does the Task have observable acceptance criteria for the main path and meaningful no-data or failure paths?
7. Does every criterion have a user test path with a starting point, action, and expected visible result?
8. Does every criterion map to an appropriate automated test scenario, without duplicating the same flow at multiple test levels?
9. Can the user or operator verify that the mechanism ran without relying only on logs or metrics?

If any answer is no, revise a new Task before publication. For an existing Task, show the missing items and the exact proposed edit, then ask for separate, explicit user approval before changing the issue. Do not impose a numeric coverage gate.

## Forbidden patterns

- Do not propose shadow runs, A/B paths, or a default-off replacement mechanism.
- Do not add PR numbers or issue IDs to issue titles.
- Do not create a separate Task only for a plan file, tests, observability, or an unfinished shared layer.
- Do not turn plan documents into subtasks or attach duplicate plan files.
- Do not publish while required decisions remain open.
- Do not claim a Feature is complete because every Task closed; the cumulative Feature acceptance criteria decide that.

## Tracker write safety

- Re-read an existing issue immediately before writing. If the target changed or a match is ambiguous, return a fresh diff for new approval instead of overwriting it.
- Publish in order: Epic, then Features, then Tasks, linking each level as a subtask of its parent.
- Preserve unrelated description content, comments, links, and existing state.
- Reuse matching issues on retry.
- Set each new issue Type to `Epic`, `Feature`, or `Task`, and new Task State to `Open`, only when the project schema allows it.
- Read back every changed issue and report created, updated, reused, and unresolved items.
