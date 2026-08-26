# Olko React Style Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.ts`/`.tsx` files; skip generated sources per docs.
2. Load config, adapter, scoped `CODING_STYLE.md`/`TESTING.md`, root `AGENTS.md`.
3. Map files to Vite/React project roots.
4. Run `reactStyleCommand` or documented tool (ESLint/Prettier) when configured.
5. Inspect documented + default style rules.
6. Report violations or run fix command when authorized.
