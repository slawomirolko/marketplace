# Olko React Architecture Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.ts`/`.tsx` files; skip `dist/`, `node_modules/`, and generated sources.
2. Load config, adapter, scoped `ARCHITECTURE.md`/`CODING_STYLE.md`/`TESTING.md`, root `AGENTS.md`.
3. Map files to the Vite/React project root and its `pages`/`components`/`api`/`queries` directories.
4. Inspect architecture: import direction, React Query ownership, API client centralization, React Hook Form boundaries, CSS Modules usage, TypeScript strictness.
5. Run `reactArchitectureCommand` when configured.
6. Report violations.
