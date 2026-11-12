# Feature Plan Workflow — Edge Cases

- **Feature missing acceptance criteria on a child Task** — stop and route to backlog drafting. Never plan from a guessed criterion.
- **Epic passed instead of a Feature** — narrow to a named Feature or route to the discovery path; an Epic plan has no Task plans.
- **Runner unavailable, `FAIL`, or `NOT VERIFIED`** — the Task stays `Ready for implementation: no`. Record the blocker in the Task plan and `tracker.md`; never downgrade a failed or missing verdict to ready.
- **Acceptance criteria change after a runner `PASS`** — the verdict is invalid. Rerun the author→validator chain for the exact current criterion set.
- **A question batch is partially answered** — do not validate, do not apply, do not ask the next batch. Follow-ups join the same batch until it closes.
- **A decision contradicts a locked decision** — return the draft for correction instead of converting the contradiction into a new user choice.
- **A reviewer finding is `ask` or names a project rule** — escalate to the batched question loop; never resolve it inside the plan.
- **`stack.md` lists a dependency nobody verified** — remove it or move it to open items; a guessed version or an uninstalled "existing" package fails the gate.
- **A superseded Task plan** — mark it superseded and link the replacement; never turn the Feature directory into a pointer stub or delete unaffected plans.
- **Readiness claimed without the complete revalidation cycle** — workflow violation. Record the cycle result in `tracker.md` or report `no`.
