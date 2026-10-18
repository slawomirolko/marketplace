# Olko React Testing Edge Cases

- Project test docs override marketplace defaults.
- Do not invent test framework requirements; use what `package.json`, `vitest.config.ts`, and docs configure.
- Manual e2e verification via `agent-browser` only runs when explicitly requested; never claim it ran without invoking it in-session.
- A test that reads config is acceptable only when the config value is critical to runtime behavior; otherwise it is a structure test and should be removed.
- Prefer extending existing tests with parametrization when setup and behavior path match.
- If a project doc conflicts with this skill, follow the doc and report the conflict.

## Rules
- Marketplace defaults are allowed here to avoid repeating standard React test conventions per project.
- Never hardcode project-specific paths, names, fixtures, or test frameworks.
- Prefer documented project rules over generic React opinions.
- Do not fix tests unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
