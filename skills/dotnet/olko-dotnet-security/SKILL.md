---
name: olko-dotnet-security
description: "Check .NET security compliance for changed C# projects with marketplace defaults. Read-only. Reads project docs and adapters, maps changed .cs/.csproj/appsettings files to source projects, checks tracked .env template and CI/CD definition files, verifies connection-string and secret handling, endpoint authorization, anonymous-access reasons, antiforgery, CORS, HTTPS/HSTS, and data-protection key persistence, and reports violations with rule ids and sources. Use when validating .NET security, before commit/test gates, during plan review, or when olko-dotnet-architecture/olko-commit-style/olko-test/olko-plan-editor delegates .NET security checks. Not for secrets in Dockerfiles or Compose files (olko-docker-style) or front-end code (olko-react-security). Triggers: '.NET security', 'dotnet security check', 'secrets in appsettings', 'endpoint authorization', 'CORS policy check', 'olko-dotnet-security'."
---

# olko-dotnet-security

## Routing Summary
Check .NET security compliance for changed C# projects with marketplace defaults. Read-only. Maps changed `.cs`, `.csproj`, and `appsettings*.json` files to source projects, also checks tracked `.env*` template files and CI/CD definition files, checks secret handling and ASP.NET Core host security rules, and reports each violation with a rule id and a rule source. Use when validating .NET security, before commit/test gates, during plan review, or when `olko-dotnet-architecture`, `olko-commit-style`, `olko-test`, or `olko-plan-editor` delegates .NET security checks.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `references/rules.md` when the check starts.
- Load `examples.md` only when the report shape is needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what this skill checks, when to use it, rule groups, and configuration keys.
- `workflow.md` - ordered check workflow and report format.
- `references/rules.md` - rule catalogue: secrets `S1`-`S8`, web host `W1`-`W6`.
- `examples.md` - report output shape.
- `edge-cases.md` - strict rules and failure handling.
