# Olko Dotnet Style Overview

Checks .NET/C# style defaults plus project docs/adapters: method shape and naming, modern C#, performance style, EF Core style, structural rules (partial-type ban, unit-of-work and repository boundaries, DB-native idempotency, mappers, thin endpoints, instrumentation setup, smart enums, shared contracts, dedicated exceptions), build-warning hygiene, generated-file skips, and `dotnet format` defaults.

Load `workflow.md` for the ordered check procedure and the rule catalogue. Load `examples.md` for the report shape.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `dotnetStyleCommand` | `dotnet format <project>.csproj --verify-no-changes --no-restore` | Command to verify .NET style. |
| `dotnetStyleFixCommand` | `dotnet format <project>.csproj --no-restore` | Command to auto-fix .NET style. |
| `dotnetProjectRoot` | nearest `.csproj` | Override project root/project path. |
| `dotnetStyleGeneratedGlobs` | `**/bin/**`, `**/obj/**`, `**/*.g.cs`, `**/*.Designer.cs`, `**/Generated/**` | Files skipped unless docs say otherwise. |
| `readArchitectureDocs` | `true` | Whether architecture docs may add style constraints. |
| `readTestingDocs` | `true` | Whether test docs may add test style constraints. |

## Marketplace defaults

Use these defaults only when config, adapter, or project docs do not override them:

```yaml
dotnetStyleCommand: "dotnet format <project>.csproj --verify-no-changes --no-restore"
dotnetStyleFixCommand: "dotnet format <project>.csproj --no-restore"
dotnetStyleGeneratedGlobs:
  - "**/bin/**"
  - "**/obj/**"
  - "**/*.g.cs"
  - "**/*.Designer.cs"
  - "**/Generated/**"
readArchitectureDocs: true
readTestingDocs: true
```

These are reusable marketplace defaults. Project-specific naming rules, layer names, and custom commands belong in `.agents/skill-config.md`, `.agents/skills/olko-dotnet-style/project.md`, or `AGENTS.md`.

Projects that must not run `dotnet format` repo-wide (for example a CRLF-configured repo checked out on Linux, where the tool reports `ENDOFLINE` on untouched files) scope the verification to the changed files with `--include` and report the scoping in the result.
