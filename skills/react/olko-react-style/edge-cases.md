# Olko React Style Edge Cases

- Project docs override marketplace defaults.
- Skip generated files (`dist/`, generated OpenAPI/GraphQL types) unless docs require checking them.
- Do not install tools, add plugins, or change config; infer narrow verify commands only for already-configured project-local tools.
- If a project doc conflicts with this skill, follow the doc and report the conflict.

## Rules
- Marketplace defaults are allowed here to avoid repeating standard React/TypeScript style conventions per project.
- Never hardcode project-specific commands, paths, or style rules.
- Prefer documented project rules over generic React opinions; never enforce undocumented personal React opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
