# olko-create-saga

## Workflow — follow these steps in order

### Step 1 — Resolve project facts
1. Read `.agents/skill-config.md`, then `AGENTS.md`, then the project adapter at `.agents/skills/olko-create-saga/project.md` if present (precedence: Configuration > Project Adapter > AGENTS.md > Marketplace skill).
2. Resolve these keys before implementing. Ask the user only for keys that remain unresolved (see Configuration keys below for defaults).

### Step 2 — Gather saga details
1. If the user wants a plan only, add the saga work to the plan and stop.
2. If any required detail is missing, ask for it before editing code. Collect:
   - saga name
   - source (start) message
   - every downstream message in order
   - the contract for each message
   - timeout requirement and timeout value, if any
   - target file locations for the saga and contracts (resolved from `sagaProject` / `contractsProject`)
   - required host listener/publisher configuration changes (resolved from `hostSetupFile`)
3. Ask only for the missing items, but keep the request complete enough to implement in one pass.
4. When details are complete, implement the saga with Wolverine conventions and the repo's .NET style rules.

### Step 3 — Implement
Prefer EF Core LINQ over raw SQL. Keep repository work single-table only. Register Wolverine listeners and publishers in `hostSetupFile` following the repo style. Apply the Saga Style Rules below.

### Step 4 — Timeout
If a timeout is required, bind the timeout value from `timeoutConfigRoot` (do not hardcode it in saga code), add the matching configuration section entry, pass the timeout into the trigger message, and create the timeout message from that value.

### Step 5 — Docs
Update the architecture `agents.md` only if the user explicitly asked for that change in the same request.

## Implementation Rules
- Prefer EF Core LINQ over raw SQL.
- Keep repository work single-table only.
- Register saga listeners and publishers explicitly in the host setup file.
- Use the repo's test and code style rules when adding coverage.

## Saga Style Rules
- Saga handlers should return messages wrapped in `resultWrapper<TMessage>` (default `ErrorOr<TMessage>`) when the workflow contract supports it. Do not return raw saga messages when a wrapper result is possible.
- Use `ILogger<TSaga>` in saga handlers and saga-focused tests so log categories stay aligned with the saga type.
- Every saga must emit instrumentation via `ActivitySource` and tag saga correlation values such as `workflow.saga_id`.
- Start methods should create a consumer activity from `traceContextHelper.GetParentContext(...)` when trace parent/state is present (when `traceContextHelper` is configured), tag `workflow.saga_id`, and log the saga start.
- Start and handle methods should log the saga lifecycle explicitly with the saga id and correlation timestamp where available.
- Provide `NotFound(...)` handlers for late or missing completion and timeout messages so Wolverine can ignore them cleanly.
- All saga messages must inherit the shared `sagaMessageBase` for correlation + saga id.
- If a saga completion message carries a payload, make the message `Result` use the concrete saga-specific type.
- The saga completion wire contract must expose `public resultWrapper<TData?> Result { get; init; }`, either inherited from `sagaMessageBaseGeneric` or declared directly on the message type when inheritance is not used.
- The generic message base's type parameter must be a dedicated record type, even when the payload is effectively empty. Do not use a generic catch-all message type as the type parameter; define a specific record type instead (it may have no properties).
- Saga start methods should return the saga instance, the outgoing message, and the timeout message as one tuple when the workflow begins with a single dispatch.
- By default, flow sagas should allow only one active saga at a time, using a static processed-saga guard (e.g. `ProcessedSagaId`) unless the user explicitly requests concurrent runs.
- Every saga should have its own configuration section for timeout settings. Keep timeout values in configuration, never hardcoded in saga handlers or saga classes.
- When a saga completion can be skipped because of business rules, keep the saga state transition explicit and return the original completion message when that matches the existing workflow contract.
- Every saga should have JSON-focused tests that cover the saga messages and payload shape, especially around the `resultWrapper<T>` wrapper and wire contracts.

## Long Running Sagas Pattern
Use this as the default pattern for long-running flow sagas unless the user asks for a different shape.
- Keep the saga in `sagaProject` and the message contracts in `contractsProject`.
- Allow only one active flow saga at a time by default, using a static guard field (e.g. `ProcessedSagaId`).
- Reject a second concurrent start with a clear exception that names the active saga id.
- Clear the static guard when the saga completes or times out, and on every exit path from the completion handler.
- Include `NotFound(...)` handlers for late completion and timeout messages.
- Add JSON tests for the saga messages and the saga behavior, including the `resultWrapper<T>` wire shape if the contract uses it.

## Question Format
When details are missing, ask one compact question that lists the missing fields, for example:

> Provide the saga name, the source message, each next message, every message contract, timeout value if needed, and the target files.

If the user provided some of the fields, ask only for the missing ones.

## Configuration keys
Recognized in `.agents/skill-config.md` or `.agents/skills/olko-create-saga/project.md`:

| Key | Meaning | Default |
|-----|---------|---------|
| `sagaProject` | project hosting saga handlers | none — ask user |
| `contractsProject` | project hosting message contracts | none — ask user |
| `hostSetupFile` | file registering Wolverine listeners/publishers | `Program.cs` |
| `sagaMessageBase` | shared base type (correlation + saga id) | none — ask user |
| `sagaMessageBaseGeneric` | generic base for completion payloads | none — ask user |
| `traceContextHelper` | type exposing `GetParentContext(...)` | none — skip consumer-span parent context |
| `resultWrapper` | result wrapper type | `ErrorOr<T>` |
| `timeoutConfigRoot` | config root for timeout sections | `appsettings.json` |

## Default behavior
With no adapter or config, the skill asks the user for `sagaProject`, `contractsProject`, `hostSetupFile`, `sagaMessageBase`, `sagaMessageBaseGeneric`, and `traceContextHelper`, uses `ErrorOr<T>` as the result wrapper, and writes timeout settings into `appsettings.json`. Every higher layer (Project Adapter > AGENTS.md) overrides these defaults. The skill never guesses project names, base types, or host file.
