---
name: olko-create-saga
description: "Create or update Wolverine saga implementations for .NET projects. Asks for missing saga name, message flow, message contracts, timeout, file locations, and host listener wiring before implementing, then applies the repo's Wolverine saga conventions (ErrorOr wrapping, ActivitySource instrumentation, NotFound handlers, single-active-saga guard, timeout-from-config, JSON tests). Triggers: 'create saga', 'add saga', 'update saga', 'new wolverine saga', 'olko-create-saga'."
---

# olko-create-saga

## Routing Summary
Create/update Wolverine saga in .NET project. Ask missing details first (saga name, source + downstream messages, contracts, timeout, file locations, host wiring), then implement following repo Wolverine saga conventions. Reads saga project facts from `.agents/skill-config.md` + project adapter — never hardcodes project names, base types, or host file. Triggers: 'create saga', 'add saga', 'update saga', 'new wolverine saga', 'olko-create-saga'.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what skill does, when to use, prerequisites.
- `workflow.md` - normal execution path (resolve facts, gather details, implement, test).
- `examples.md` - config keys, resolved saga shape, prompt wording.
- `edge-cases.md` - timeout handling, late messages, concurrent sagas, skip-completion rules.
