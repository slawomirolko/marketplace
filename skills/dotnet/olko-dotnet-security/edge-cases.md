# Olko Dotnet Security Edge Cases

- **No config and no adapter** - apply all rules with the defaults in `overview.md`.
- **`projectAdapter: false`** - ignore `.agents/skills/olko-dotnet-security/project.md`, also when it exists.
- **Project doc conflicts with a rule** - follow the doc. Report the conflict once. Do not report the finding.
- **No web host in scope** - check `S` rules only. Report the `W` rules as not applicable, not as checked.
- **Evidence is not available** (for example, the startup file or deployment files are outside the repository) - report a `check` that names the missing fact. Do not guess.
- **Secrets in Dockerfiles or Compose files** - out of scope. `olko-docker-style` owns them.

## Strict rules
- Never edit code. Report findings only.
- Never print a secret value in a report. Name the file, line, and key only.
- Never flag untouched code. Read outside the scope only to get evidence.
- Never hardcode project-specific paths, project names, or commands.
- Do not report a complete check when `checked` is not equal to `total`.
