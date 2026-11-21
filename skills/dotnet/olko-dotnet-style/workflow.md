# Olko Dotnet Style Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.cs` / `.csproj` files.
2. Load config, adapter, scoped style docs, and root `AGENTS.md`.
3. Map files to projects.
4. Run `dotnetStyleCommand` or documented style command.
5. Inspect documented/default style rules.
6. CancellationToken default check: in every changed `.cs` file, inspect each interface member and method declaration that takes `CancellationToken <name>` and report a violation when the parameter omits `= default`, even if the implementation supplies it. Source: `olko-dotnet-style:Default .NET style rules`.
7. Structural check: mapping only through extension methods, thin endpoint delegating to a read service, `activity?.SetTag` grouped in a `Setup<Operation>Instrumentation` method, closed value sets as smart enums persisted through `HasConversion`, one shared contract constant or UTC-format helper, dedicated exception type per recurring invalid-input rule. Source: `olko-dotnet-style:Structural rules`.
8. Build-warning check: build the changed projects and report every new analyzer warning on a changed file (`SA1117`, `SA1000`, `SA1011`, `SA1118`, `IDE0130`). `IDE0007`/`IDE0008` are never violations. Source: `olko-dotnet-style:Build warning hygiene`.
9. Report violations or run fix command when authorized.
