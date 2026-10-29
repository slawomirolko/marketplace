# Olko Dotnet Style Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.cs` / `.csproj` files.
2. Load config, adapter, scoped style docs, and root `AGENTS.md`.
3. Map files to projects.
4. Run `dotnetStyleCommand` or documented style command.
5. Inspect documented/default style rules.
6. CancellationToken default check: in every changed `.cs` file, inspect each interface member and method declaration that takes `CancellationToken <name>` and report a violation when the parameter omits `= default`, even if the implementation supplies it. Source: `olko-dotnet-style:Default .NET style rules`.
7. Report violations or run fix command when authorized.
