# Olko Plan Editor

## Examples

Load this file only when concrete output shape, prompt wording, or naming examples are needed.

For Feature `PP-100`, create the shared Feature plan and one implementation plan for every child Task in the same planning session. For Task `PP-123`, write its plan at:

```text
plans/features/PP-100/tasks/PP-123-implementation.md
```

The Task file links to Feature `PP-100`, records only Task `PP-123`'s implementation steps, affected domain models/value objects, changed-path estimate, tests, runtime evidence, dependencies, and acceptance. Reuse the Feature business goal and shared Feature tracker. Create the equivalent file for every other current child Task before the Feature planning session completes.

```text
plans/features/PP-100/
  business.md
  implementation.md
  stack.md
  tracker.md
  tasks/
    PP-123-implementation.md
    PP-124-implementation.md
```

`tracker.md` is the planning decision and validation register. The implementation flow creates a separate `feature-tracker.md` later to track PRs and runtime evidence. Preserve the Feature files and sibling Task plans when one Task plan is completed or revised.

For an Epic-only target such as `plans/checkout`, create:

```text
plans/checkout-business.md
plans/checkout-technical.md
```

The business document explains purpose, users, mechanism, boundaries, and success. The technical document links back to it and contains files, flow, design, implementation steps, configuration, dependencies, and tests.
