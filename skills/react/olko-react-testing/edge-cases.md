# Olko React Testing Edge Cases

- Project test docs override marketplace defaults.
- Do not invent test framework requirements; use what `package.json`, `vitest.config.ts`, and docs configure.
- Manual e2e verification via `agent-browser` only runs when explicitly requested; never claim it ran without invoking it in-session.
- A test that reads config is acceptable only when the config value is critical to runtime behavior; otherwise it is a structure test and should be removed.
- Prefer extending existing tests with parametrization when setup and behavior path match.
