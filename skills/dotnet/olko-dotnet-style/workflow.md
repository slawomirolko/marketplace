# Olko Dotnet Style Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.cs` / `.csproj` files.
2. Load config, adapter, scoped style docs, and root `AGENTS.md`.
3. Map files to projects.
4. Run `dotnetStyleCommand` or documented style command.
5. Inspect documented/default style rules.
6. Report violations or run fix command when authorized.
