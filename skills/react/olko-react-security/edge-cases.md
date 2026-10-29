# Olko React Security Edge Cases

- **No config and no adapter** - apply all rules with the defaults in `overview.md`.
- **`projectAdapter: false`** - ignore `.agents/skills/olko-react-security/project.md`, also when it exists.
- **Project doc conflicts with a rule** - follow the doc. Report the conflict once. Do not report the finding.
- **No app shell or package files in scope** - report groups `H` and `P` as not applicable, not as checked.
- **Authentication mode unknown** - report `T3` as a `check` that names the missing fact. Do not guess cookie or bearer.
- **Back-end gap found (`T2`, `T3`)** - report it to the caller. Do not check back-end code here; the back-end stack's security skill owns it.
- **No documented sanitizer** - report `B2` or `D3` findings with the fix "document and use one sanitizer". Do not pick a library for the project.

## Strict rules
- Never edit code. Report findings only.
- Never print a secret or token value in a report. Name the file, line, and key only.
- Never flag untouched code. Read outside the scope only to get evidence.
- Never hardcode project-specific package names, commands, or paths.
- Do not report a complete check when `checked` is not equal to `total`.
