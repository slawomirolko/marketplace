# Olko Dotnet Security Overview

Check .NET security compliance for changed C# projects, with marketplace defaults. This skill is read-only. It reports violations. It does not fix code.

## What I do
- Map changed `.cs`, `.csproj`, and `appsettings*.json` files to their nearest `.csproj`.
- Check changed tracked `.env*` template files (for example `.env.example`) and CI/CD definition files (`.github/workflows/*.yml`, `azure-pipelines*.yml`, `.gitlab-ci.yml`) against the `S` rules. Never read untracked `.env` files.
- Read security rules from `.agents/skill-config.md`, `.agents/skills/olko-dotnet-security/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `CODING_STYLE.md`.
- Check changed lines against the rule catalogue in `references/rules.md` and against documented project security rules.
- Run a configured security command when one exists.
- Report every violation with rule id, file, line, broken rule, and rule source.

## When to use
Use when validating .NET security, before commit/test gates, during plan review, or when `olko-dotnet-architecture`, `olko-commit-style`, `olko-test`, or `olko-plan-editor` delegates .NET security checks. Apply it to the same scope as `olko-dotnet-architecture`.

## Rule groups

| Group | Ids | Applies to |
|-------|-----|------------|
| Connection strings and secrets | `S1`-`S8` | all .NET projects, their settings files, tracked `.env*` templates, and CI/CD definition files |
| ASP.NET Core web host | `W1`-`W6` | web host projects only (`Microsoft.NET.Sdk.Web`, or code that maps endpoints or controllers) |

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Load `.agents/skills/olko-dotnet-security/project.md`. |
| `dotnetSecurityCommand` | — | Optional command that runs security checks (for example a vulnerable-package scan or an analyzer run). |
| `dotnetSecurityRulesDisabled` | `[]` | Rule ids to skip, for example `[S8, W5]`. |
| `dotnetSecurityGeneratedGlobs` | `**/bin/**`, `**/obj/**`, `**/*.g.cs`, `**/*.Designer.cs`, `**/Generated/**` | Files skipped unless docs say otherwise. |

With no config and no adapter, all rules apply with the defaults above. Project-specific rule changes belong in `.agents/skill-config.md`, the project adapter, or `AGENTS.md`.

## Related skills
- `olko-dotnet-architecture` owns layering, configuration flow, and the ASP.NET Core pipeline guidance (`references/aspnet-core.md`). This skill owns the security rules.
- `olko-docker-style` owns secrets in Dockerfiles and Compose files. Do not re-check them here.
