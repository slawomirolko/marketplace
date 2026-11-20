# Task Implementation Workflow — Edge Cases

- **Missing plan or criteria** — stop and route to the plan-documentation orchestrator. Never let a child guess a criterion.
- **Manifest missing at baseline** — stop and return to the planning E2E matrix gate. Never author a mapping during implementation.
- **`PLAN_UPDATE_REQUIRED` / `BLOCKED` in preflight** — no implementer dispatch. Route material plan changes through impact triage and rerun all four checks.
- **Test dispute** — send the objection back to the test-first author; if it justifies the test and the implementer still disagrees, stop and show both positions verbatim.
- **Edge-case loop** — runs once. A still-failing test after it goes to the user.
- **No positive execution evidence** — `NOT VERIFIED`. Errors absent is not proof the behavior ran.
- **Isolation impossible** — stop and report; never rebuild the main Compose project during worktree steps.
- **Mobile Kotlin change** — the full instrumentation suite is mandatory; a filtered subset never counts, and a missing emulator is a blocker to resolve.
- **Gap outside the Task scope** — follow the scope-gate procedure. Never create a Task on your own.
- **Post-merge E2E fails** — retain the worktree; cleanup waits for a pass.
