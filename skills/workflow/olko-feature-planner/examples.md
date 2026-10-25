# Task description example

Use these six short sections in each Task description. The headings and prose follow the project's issue language; code identifiers, paths, and names stay English. This illustrative Task is one independently verifiable PR:

```markdown
## Outcome and PR
- Outcome: The app shows the last completed analysis and the time of its result.
- PR: One production PR covering the API response and the visible app state.
- Delivery safety: Existing analysis behavior remains usable after this PR; the result does not depend on an unfinished successor.
- Feature milestone: After this PR, the user can see the last completed result and its time; verify on the analysis screen.
- Planned changed files: About 8 distinct counted code paths (estimate), including tests and configuration; within the 5–15 target range.
- Independence: The result can be accepted after this PR, without waiting for a later task.

## Domain models and value objects
- `<ExistingDomainModel>` (`<repository path>`): reuse as the source of the result; no new domain type is planned. Verify the type and ownership against the current code before publishing the Task.

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
