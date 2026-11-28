# Olko Dotnet Testing Overview

Checks .NET test conventions plus project docs/adapters: test tiers, coverage expectations, `InternalsVisibleTo` placement, reflection ban, fixtures and builders, integration database reset, skip/silent-pass policy, assertion library, test doubles, test authoring rules (Arrange/Act/Assert markers, production-type reuse, internal builders, two-underscore naming), saga/serialization conventions, and timeouts.

Load `workflow.md` for the ordered check procedure and the rule catalogue. Load `examples.md` for the report shape.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `dotnetTestCommand` | `dotnet test <test-project>.csproj --no-restore` | Command to run .NET tests. |
| `dotnetTestProjectPatterns` | `*.Tests.csproj`, `*.Tests.Integration.csproj`, `*.Integration.Tests.csproj` | Test project discovery globs. |
| `readTestingDocs` | `true` | Whether to read test docs. |
| `dotnetTestingDocs` | `TESTING.md`, `Tests_convention.md` | Additional test convention docs to read when present. |

## Marketplace defaults

```yaml
dotnetTestCommand: "dotnet test <test-project>.csproj --no-restore"
dotnetTestProjectPatterns:
  - "*.Tests.csproj"
  - "*.Tests.Integration.csproj"
  - "*.Integration.Tests.csproj"
readTestingDocs: true
dotnetTestingDocs:
  - "TESTING.md"
  - "Tests_convention.md"
```

Project-specific fixtures, container images, builders, and commands belong in `.agents/skill-config.md`, `.agents/skills/olko-dotnet-testing/project.md`, or `AGENTS.md`.
