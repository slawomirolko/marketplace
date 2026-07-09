# Olko Kotlin Testing Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.kt` source and test files (`app/src/test`, `app/src/androidTest`).
2. Load config, adapter, `TESTING.md`, `CODING_STYLE.md`, scoped docs, and root `AGENTS.md`.
3. Map source changes to related test files.
4. Inspect test conventions.
5. Run configured test command when needed (with explicit timeout for unit tests).
6. Report violations with rule sources.
