---
name: olko-dotnet-migration
description: "Create and inspect .NET EF Core database migrations using dotnet ef and the dotnet CLI only. Resolves the DbContext project and startup host from config or by asking, runs migrations add/remove/list and database update, then verifies by applying and reverting the migration via the EF CLI. Never hand-writes migrations or raw SQL unless asked. Triggers: 'add migration', 'ef migration', 'database update', 'scaffold migration', 'remove migration', 'list migrations', 'dotnet ef', 'olko-dotnet-migration'."
---

# olko-dotnet-migration

## Routing Summary
Create/inspect .NET EF Core migrations with `dotnet ef` + `dotnet` CLI only. Resolve DbContext project and startup host from config or by asking. Add/remove/list migrations, update the database, then verify by applying and reverting via the EF CLI. Never hand-write migrations or raw SQL unless asked. Triggers: 'add migration', 'ef migration', 'database update', 'scaffold migration', 'remove migration', 'list migrations', 'dotnet ef', 'olko-dotnet-migration'.

## Rules
- Use only .NET tools and commands (`dotnet ef`, `dotnet`).
- Prefer `dotnet ef migrations add`, `migrations remove`, `migrations list`, and `database update`.
- Do not invent migration names, connection strings, or startup projects — ask when missing.
- Do not write raw SQL unless the user explicitly asks for it.
- Do not change application code unless the migration task requires it and the user asked for the change.
- After generating a migration, verify it by applying (`database update`) then reverting (`database update <PreviousMigrationOr0>`) with the EF CLI, restoring the database to its prior state.

## Workflow
1. Resolve the DbContext project and startup host: read `.agents/skill-config.md`, then `AGENTS.md`, then `.agents/skills/olko-dotnet-migration/project.md` if present (precedence: Configuration > Project Adapter > AGENTS.md > Marketplace skill). Use `dbContextProject` / `startupProject` when configured; otherwise inspect the solution, project, and `DbContext` to choose the correct `--project` / `--startup-project`. If the layout is unclear or ambiguous, ask instead of guessing.
2. Confirm the available `dotnet ef` tooling from the repo context (tool manifest, package references) when needed.
3. Create or inspect the migration with the resolved `dotnet ef` options (see Command Patterns).
4. Apply the migration with `dotnet ef database update`.
5. Revert it with the EF CLI (`dotnet ef database update <PreviousMigrationOr0>`) to confirm it rolls back cleanly, leaving the database at its prior state.
6. Verify the generated files and the EF model snapshot.
7. Report exactly which command was used and which files changed.

## Command Patterns
- Add: `dotnet ef migrations add <MigrationName> --project <Project.csproj> --startup-project <Startup.csproj>`
- Remove last: `dotnet ef migrations remove --project <Project.csproj> --startup-project <Startup.csproj>`
- List: `dotnet ef migrations list --project <Project.csproj> --startup-project <Startup.csproj>`
- Update database: `dotnet ef database update --project <Project.csproj> --startup-project <Startup.csproj>`
- Revert: `dotnet ef database update <PreviousMigrationOr0> --project <Project.csproj> --startup-project <Startup.csproj>`

## Guardrails
- If the project layout is unclear, inspect the solution and project files before choosing a command.
- Use the actual host project as `--startup-project`; never guess.
- If the migration name is missing, ask for it instead of inventing one.
- When verifying by applying and reverting, use the EF CLI only and restore the database to its prior state.
- Keep scripts/helpers inside .NET tooling unless explicitly asked otherwise.

## Configuration keys
Recognized in `.agents/skill-config.md` or `.agents/skills/olko-dotnet-migration/project.md`:

| Key | Meaning | Default |
|-----|---------|---------|
| `dbContextProject` | project that owns the DbContext and receives migration files (`--project`) | none — inspect solution, ask if ambiguous |
| `startupProject` | host project that builds/runs EF tooling (`--startup-project`) | none — inspect solution, ask if ambiguous |
| `dbContext` | named DbContext when several exist (`--context`) | none — `dotnet ef` default |
| `efExtraArgs` | extra `dotnet ef` arguments applied to every command | none |

## Default behavior
With no adapter or config, the skill inspects the solution and project layout to find the DbContext-owning project and the startup host, asks for any value it cannot infer, runs the requested `dotnet ef` operation, and verifies by applying then reverting via the EF CLI. It uses no non-`dotnet` tools and never invents migration names or connection strings. Every higher layer (Project Adapter > AGENTS.md) overrides these defaults.
