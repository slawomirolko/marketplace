# Olko Python Security Edge Cases

- **No config and no adapter** - apply all rules with the defaults in `overview.md`.
- **`projectAdapter: false`** - ignore `.agents/skills/olko-python-security/project.md`, also when it exists.
- **Project doc conflicts with a rule** - follow the doc. Report the conflict once. Do not report the finding.
- **Evidence is not available** - report a `check` that names the missing fact. Do not guess.
- **Ignored `.env` files** - do not read or report values from untracked `.env` files. Check only tracked templates and the code that loads them.

## Strict rules
- Never edit code. Report findings only.
- Never print a secret value in a report. Name the file, line, and key only.
- Never flag untouched code. Read outside the scope only to get evidence.
- Never hardcode project-specific package names, commands, or paths.
- Do not report a complete check when `checked` is not equal to `total`.
