# Feature Plan Workflow — Overview

Load for full Feature or Epic implementation planning, after the Feature and its child Tasks already exist with acceptance criteria.

## Deliverable

One planning session produces, for `plans/features/<feature-id>/`:

- `business.md` — business outcome, measurable success, scope, non-goals, risks;
- `implementation.md` — ordered Task rollout, integration contract, readiness verdict;
- `stack.md` — design patterns, technology stack, and existing/new dependencies;
- `tracker.md` — decisions, question batches and closure, evidence, readiness, next steps;
- `tasks/<task-id>-implementation.md` — one file per current child Task, each scoping one Task and one PR.

## Rules of the package

- The Feature plan owns business outcome, rollout, cross-Task dependencies, and shared decisions.
- A Task plan owns its own outcome, counted code paths, domain models, implementation and verification contract, and independent merge safety.
- A Task is planned even when a predecessor must land first; the dependency is recorded, never a reason to omit the plan.
- Resume from `tracker.md`. Preserve unaffected Task plans when one Task scope changes; mark and link only the superseded file.
- Planning never writes production code, runs shell commands, commits, pushes, or changes agent/model configuration.

## Gates that make a plan ready

Consistency (business↔technical, bidirectional), targeted stack audits, plan review, one batched question loop, acceptance-to-E2E matrix with a runner verdict, then finalization. A plan missing any gate is not ready.
