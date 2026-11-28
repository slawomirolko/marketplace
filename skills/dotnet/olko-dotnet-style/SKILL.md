---
name: olko-dotnet-style
version: 1.8.0
description: "Check .NET/C# style compliance for changed C# projects with marketplace defaults. Maps .cs/.csproj files to source projects, reads project docs/adapters, runs dotnet format by default when no project command is configured, checks common C# style expectations that docs enable (partial-type ban, unit-of-work and repository boundaries, unique-index idempotency through the unit of work, mappers, thin endpoints, instrumentation setup), and reports violations with rule sources. Use when validating .NET style, linting C# changes, before commit/test gates, or when olko-commit-style delegates .NET style checks."
---

# olko-dotnet-style

## Routing Summary
Check .NET/C# style compliance for changed C# projects with marketplace defaults. Maps `.cs`/`.csproj` files to source projects, reads project docs and adapters, runs `dotnet format` when no project command is configured, and reports violations with rule sources.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when the report shape is needed.
- Load `edge-cases.md` only for strict rules and failure handling.

## Where the rules live
| Need | File |
|------|------|
| What this skill checks, configuration keys, marketplace defaults | `overview.md` |
| Ordered check procedure (scope, adaptation layers, projects, command, inspection) | `workflow.md` > `## Workflow` |
| Default .NET style rule catalogue (method shape, naming, modern C#, performance, EF Core) | `workflow.md` > `## Default .NET style rules` |
| Structural rules: partial-type ban, unit-of-work and repository boundaries, DB-native idempotency, mappers, thin endpoints, instrumentation, smart enums, shared contracts, dedicated exceptions | `workflow.md` > `## Structural rules` |
| Build-warning hygiene | `workflow.md` > `## Build warning hygiene` |
| Report shape | `examples.md` |
| Strict rules and failure handling | `edge-cases.md` |

Do not restate rule bodies here: the catalogue is single-sourced in `workflow.md` and every report cites the section name.

## Rules
- Marketplace defaults are allowed here to avoid repeating standard .NET style commands per project.
- Never hardcode project-specific paths, layer names, or business rules in this skill; project specifics belong to `.agents/skill-config.md`, the project adapter, or scoped docs.
- Prefer documented project rules over generic .NET opinions; when a doc overrides a default, follow the doc and name the conflict.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
