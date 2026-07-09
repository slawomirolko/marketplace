# Olko Kotlin Architecture Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.kt`/`.kts` files; skip `build/` and generated sources.
2. Load config, adapter, scoped `ARCHITECTURE.md`/`CODING_STYLE.md`/`TESTING.md`, root `AGENTS.md`.
3. Map files to Gradle roots and source sets.
4. Inspect architecture: import direction, module boundaries, MVVM separation, networking ownership, dependency config, security, external-service client config.
5. Run `kotlinArchitectureCommand` when configured.
6. Report violations.
