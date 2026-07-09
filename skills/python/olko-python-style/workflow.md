# Olko Python Style Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.py` files; skip generated sources per docs.
2. Load config, adapter, scoped `CODING_STYLE.md`/`TESTING.md`, root `AGENTS.md`.
3. Map files to `pyproject.toml` roots.
4. Run `pythonStyleCommand` or documented tool (ruff/mypy/pyright) when configured.
5. Inspect documented + default style rules.
6. Report violations or run fix command when authorized.
