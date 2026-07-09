# Olko Python Architecture Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.py` files; skip generated sources per docs.
2. Load config, adapter, scoped `ARCHITECTURE.md`/`CODING_STYLE.md`/`TESTING.md`, root `AGENTS.md`.
3. Map files to `pyproject.toml` roots.
4. Inspect architecture: import direction, package boundaries, generated ownership, source layout, runtime/deps, observability, external-service client config.
5. Run `pythonArchitectureCommand` when configured.
6. Report violations.
