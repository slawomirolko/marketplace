---
name: olko-dotnet-testing
version: 1.4.0
description: "Check .NET test conventions for changed C# projects with marketplace defaults. Reads project docs/adapters, maps source changes to test projects, verifies InternalsVisibleTo usage, test visibility boundaries, required Arrange/Act/Assert markers, production-type reuse over local DTO duplicates, internal test-data builders, two-underscore naming, smart enum coverage, saga JSON/ErrorOr assertion conventions, performance validation expectations, and reports violations with rule sources. Use when validating .NET tests, before commit/test gates, or when olko-test delegates .NET test-convention checks."
---

# olko-dotnet-testing

## Routing Summary
Check .NET test conventions for changed C# projects with marketplace defaults. Reads project docs and adapters, maps source changes to test projects, and reports violations with rule sources.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when the report shape is needed.
- Load `edge-cases.md` only for strict rules and failure handling.

## Where the rules live
| Need | File |
|------|------|
| What this skill checks, configuration keys, marketplace defaults | `overview.md` |
| Ordered check procedure (scope, adaptation layers, inspection, run, report) | `workflow.md` > `## Workflow` |
| Default .NET test rule catalogue (tiers, coverage, visibility, reflection ban, fixtures/builders, database reset, skip policy, assertions, doubles) | `workflow.md` > `## Default .NET test rules` |
| Test authoring rules: Arrange/Act/Assert markers, production types over local duplicates, internal builders, naming | `workflow.md` > `## Test authoring rules` |
| Saga, serialization, timeout rules | `workflow.md` > `## Default .NET test rules` |
| Report shape | `examples.md` |
| Strict rules and failure handling | `edge-cases.md` |

Do not restate rule bodies here: the catalogue is single-sourced in `workflow.md` and every report cites the section name.

## Rules
- Marketplace defaults are allowed here to avoid repeating standard .NET test conventions per project.
- Never hardcode project-specific paths, names, fixtures, or test frameworks; project specifics belong to `.agents/skill-config.md`, the project adapter, or scoped docs.
- Prefer documented project rules over generic .NET opinions; when a doc overrides a default, follow the doc and name the conflict.
- Do not fix tests unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
