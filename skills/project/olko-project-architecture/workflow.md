# Olko Project Architecture Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed files; discover the top-level layout by convention.
2. Load config, adapter, scoped `AGENTS.md`/`ARCHITECTURE.md`, root `AGENTS.md`.
3. Inspect top-level separation.
4. Inspect DDD layering and dependency direction.
5. Inspect cross-surface communication and shared code.
6. Delegate the `ai/` subtree to `olko-ai-architecture` when declared in `uses`.
7. Run `projectArchitectureCommand` when configured.
8. Report violations.
