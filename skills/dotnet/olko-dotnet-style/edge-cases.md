# Olko Dotnet Style Edge Cases

- Skip generated files matching configured generated globs unless docs require checking them.
- Project docs override marketplace defaults; name the conflict when they do.
- Do not enforce personal C# opinions that are not listed in defaults/docs.
- `dotnet format --verify-no-changes` can exit non-zero on a repo that stores files with mixed line endings: confirm every reported `ENDOFLINE`/`IMPORTS` entry sits on an untouched file, re-run with `--include <changed files>`, and never report untouched-file noise as a violation.
- A `partial` in EF-generated migrations/designers, a source-generated `JsonSerializerContext`, or top-level-statement `Program.cs` is not a violation; any other `partial`, including a pre-existing endpoint slice set, is reportable once the project has scheduled its refactor.
- Host-level `IL2026`/`IL3050` warnings raised by `Map*` registrations in top-level statements are structural, not per-endpoint defects; report them once, at the host file, and do not silence them with attributes that only move the warning.
