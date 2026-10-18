# Olko React Architecture Edge Cases

- Project docs override marketplace defaults.
- Skip generated files (`dist/`, generated OpenAPI/GraphQL types) per docs/config.
- If a project doc conflicts with this skill, follow the doc and report the conflict.

## Rules
- Marketplace defaults are allowed here to avoid repeating standard React/Vite architecture conventions per project.
- Never hardcode project-specific package names, commands, or paths.
- Prefer documented project rules over generic React opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
