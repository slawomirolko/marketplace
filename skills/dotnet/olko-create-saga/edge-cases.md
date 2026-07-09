# olko-create-saga

## Edge cases
- **No project adapter and no config** — the skill asks the user for `sagaProject`, `contractsProject`, `hostSetupFile`, `sagaMessageBase`, `sagaMessageBaseGeneric`, and `traceContextHelper` before editing. Do not guess project names or base types.
- **`traceContextHelper` absent** — skip consumer-span parent-context creation; still emit an `ActivitySource` span and tag `workflow.saga_id`. Do not invent a helper type.
- **Timeout required but no config root configured** — default to `appsettings.json`; add the section there. Never hardcode the timeout duration in the saga class or handler.
- **Completion can be skipped by business rules** — keep the saga state transition explicit and return the original completion message when that matches the existing workflow contract; do not silently drop the state change.
- **Concurrent saga start requested** — only drop the single-active-saga guard when the user explicitly asks for concurrent runs; otherwise keep the static `ProcessedSagaId` guard.
- **Late completion / timeout messages** — always provide `NotFound(...)` handlers so Wolverine ignores them cleanly; never assume ordered delivery.

## Rules
- Follow the Layered Skill Adaptation Pattern precedence: Configuration > Project Adapter > AGENTS.md > Marketplace skill.
- Never hardcode project names, base types, host file, or timeout durations in the marketplace skill body — read them from config/adapter.
- Never change the `resultWrapper` default beyond `ErrorOr<T>` in the skill body; a project adapter may override it.
- Preserve every technical term, type name, command, and path exactly when surfaced from config.
- Do not auto-load other skills; declare any dependency via `uses` in the project adapter only.
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports its own project adapter at `.agents/skills/olko-create-saga/project.md`.
