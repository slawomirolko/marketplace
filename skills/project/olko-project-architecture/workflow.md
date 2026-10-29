# Olko Project Architecture Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed files; discover the top-level layout and package-manager workspace roots.
2. Load config, adapter, scoped `AGENTS.md`/`ARCHITECTURE.md`, root `AGENTS.md`.
3. Inspect top-level separation.
4. Inspect DDD layering and dependency direction.
5. Inspect cross-surface communication and shared code, including workspace package ownership and dependency declarations.
6. For React Native surfaces, verify app/package roots, React Native dependency uniqueness, Metro resolution, native autolinking/codegen, and app-specific build roots.
7. Delegate the `ai/` subtree to `olko-ai-architecture` when declared in `uses`.
8. Run `projectArchitectureCommand` when configured.
9. Report violations.
