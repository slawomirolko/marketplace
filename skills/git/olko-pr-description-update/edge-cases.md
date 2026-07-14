# Olko PR Description Update

## Edge Cases

- If no linked PBI/Bug exists, do not fabricate one. Ask for issue context or omit the PBI/Bug context only when the user explicitly confirms there is no issue.
- If `prDescriptionRequireFlow` is `true`, never omit `Flow`, even for trivial changes.
- If the change has no meaningful error branch, keep the flow to the happy path and one observable outcome.
- If `gh` is unavailable or unauthenticated, return the full PR body instead of failing the commit workflow.
- If updating an existing PR body, preserve manually written sections that do not conflict with the required template.

## Rules

- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
- Never hardcode project-specific issue prefixes, PR templates, commands, or repository paths.
- Node labels must be component or layer names, not code symbols or variable names.
- GitHub renders `flowchart TD` inside a `mermaid` code block natively; no plugin is needed.
