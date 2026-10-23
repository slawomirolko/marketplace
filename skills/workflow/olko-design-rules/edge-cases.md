# Olko Design Rules Edge Cases

- **No config and no adapter** - apply all rules with the defaults in `overview.md`.
- **`projectAdapter: false`** - ignore `.agents/skills/olko-design-rules/project.md`, also when it exists.
- **Rule conflicts with a stack style skill or project doc** - the stack skill or doc wins. Report the conflict once. Do not report the finding.
- **Evidence is not available** (for example, no full-repository search for D3 or C3) - do not report the finding. Say which rule you could not verify.
- **Plan time with code rules** - do not apply code rules C1-C8 or .NET-only rules N1-N3 to a plan.
- **A pattern matches an established repository convention** - do not flag it under D4, D7, or D9.

## Strict rules
- Never edit code. Report findings only.
- Never flag untouched code. Read outside the scope only to get evidence.
- Never re-flag a category that `overview.md` lists under "Covered elsewhere" or "Not adopted".
- Do not report a complete scan when `checked` is not equal to `total`.
