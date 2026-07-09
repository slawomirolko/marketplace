# olko-create-saga

## Overview
Create/update Wolverine saga in .NET repo. Ask missing details first, implement one pass, follow repo saga conventions.

## What I do
- Resolve project facts from `.agents/skill-config.md` + project adapter (project names, base types, host file)
- Collect missing saga details before any code edit
- Implement saga w/ Wolverine conventions + repo .NET style
- Apply saga style rules: `ErrorOr<T>` wrapping, `ActivitySource` instrumentation, `ILogger<TSaga>`, `NotFound(...)` handlers, single-active-saga guard, timeout-from-config
- Add JSON tests for saga messages + `ErrorOr<T>` wire shape
- Register listeners/publishers in host setup file

## When to use me
User says 'create saga', 'add saga', 'update saga', 'new wolverine saga'. Also when saga exists and needs change.

## Prerequisites
- Run from .NET repo root w/ Wolverine + EF Core
- `.agents/skill-config.md` or project adapter supplies project facts (`sagaProject`, `contractsProject`, `hostSetupFile`, `sagaMessageBase`, `traceContextHelper`). If absent, skill asks user for file locations.
- Load `workflow.md` after selection.
