# Olko Kotlin Style Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.kt`/`.kts` files; skip generated sources per docs.
2. Load config, adapter, scoped `CODING_STYLE.md`/`TESTING.md`, root `AGENTS.md`.
3. Map files to Gradle module roots.
4. Run `kotlinStyleCommand` or documented tool (ktlint/detekt) when configured.
5. Inspect documented + default style rules.
6. Report violations or run fix command when authorized.
