# Olko Kotlin Security Edge Cases

- **`projectAdapter: false`** - ignore `.agents/skills/olko-kotlin-security/project.md`, also when it exists.
- **Cleartext in a debug-only source set** - allowed by `S3` when it is limited to local dev hosts. Do not flag it.

## Strict rules
- Never edit code. Report findings only.
- Never print a secret value in a report. Name the file, line, and key only.
- Never flag untouched code. Read outside the scope only to get evidence.
- Never hardcode project-specific package names, commands, or paths.
- Do not report a complete check when `checked` is not equal to `total`.
