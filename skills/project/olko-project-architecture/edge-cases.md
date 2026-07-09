# Olko Project Architecture Edge Cases

- Do not fix code unless the user or parent workflow asks for fixes.
- Delegate the `ai/` subtree to `olko-ai-architecture` only when declared via `uses` in the project adapter.
- Project docs override marketplace defaults; discover app/service/module names by convention, never hardcode them.
