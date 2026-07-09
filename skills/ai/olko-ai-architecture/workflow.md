# Olko AI Architecture Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed files; detect the `ai/` root and buildable surfaces.
2. Load config, adapter, scoped `ARCHITECTURE.md`, and root `AGENTS.md`.
3. Inspect the `ai/` layout (context/skills/prompts/templates split, monolith context, `global.md`).
4. Cross-check coverage: each codebase surface has context + skill coverage; no stale artifacts.
5. Run `aiArchitectureCommand` when configured.
6. Report violations.
