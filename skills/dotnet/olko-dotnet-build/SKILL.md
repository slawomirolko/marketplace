---
name: olko-dotnet-build
description: "Build and diagnose .NET solutions with the dotnet CLI only. Starts from the most relevant solution entry point, runs a single restore then build --no-restore, isolates the first failing project, and reports the exact compiler error before any fix is attempted. Triggers: 'build', 'dotnet build', 'restore .net', 'verify build', 'olko-dotnet-build'."
---

# olko-dotnet-build

## Routing Summary
Build/diagnose .NET solution with dotnet CLI only. Resolve entry point from config or context, restore once, build --no-restore, isolate first failing project, report exact error, ask before fixing. No non-dotnet tools or shell wrappers. Triggers: 'build', 'dotnet build', 'restore .net', 'verify build', 'olko-dotnet-build'.

## Workflow
1. Resolve the build target: read `.agents/skill-config.md`, then `AGENTS.md`, then `.agents/skills/olko-dotnet-build/project.md` if present (precedence: Configuration > Project Adapter > AGENTS.md > Marketplace skill). Use `solutionEntry` if configured; otherwise start from the most relevant startup project or solution entry point, not every project in the repo.
2. Prefer a single `dotnet restore` for that entry point, then `dotnet build --no-restore` for the same target.
3. If the solution build fails, do not immediately fan out into every dependent project. First inspect the first failing project in the output.
4. Rerun only that project directly when the solution output is dominated by restore-graph, workload-resolver, or design-time noise.
5. Only walk the dependency chain when the first failing project clearly depends on another local project that must be built first.
6. Keep `-p:MSBuildEnableWorkloadResolver=false` on direct project retries.
7. Do not use non-`dotnet` build tools or shell wrappers.
8. If the build fails, stop at the first real compiler/build error and report:
   - the failing project
   - the exact error message
   - the most likely cause, if it is clear from the output
9. Ask whether the user wants the build fixed before making any code changes.

## Build Rules
- Build the relevant entry point first; do not force a full-solution retry unless the project graph genuinely requires it.
- Use only `dotnet` CLI commands for restore, build, and related diagnostics.
- Treat environment failures (missing SDK, workload, auth) separately from code failures and report them clearly.
- If the build succeeds, say so directly and include the command used.

## Configuration keys
Recognized in `.agents/skill-config.md` or `.agents/skills/olko-dotnet-build/project.md`:

| Key | Meaning | Default |
|-----|---------|---------|
| `solutionEntry` | startup project / solution file to build | none — infer most relevant entry point |
| `buildConfiguration` | build configuration (e.g. Debug/Release) | none — use dotnet default |
| `buildExtraArgs` | extra dotnet build arguments | none |

## Default behavior
With no adapter or config, the skill infers the most relevant entry point from the repo, runs `dotnet restore` then `dotnet build --no-restore`, and reports the first real error. It uses no non-`dotnet` tools and never guesses a project when the entry point is ambiguous — it asks. Every higher layer (Project Adapter > AGENTS.md) overrides these defaults.
