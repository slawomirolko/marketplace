# Olko Dotnet Testing Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.cs` / `.csproj` files.
2. Load config, adapter, `TESTING.md`, `Tests_convention.md`, scoped docs, and root `AGENTS.md`.
3. Map source changes to related test projects.
4. Inspect test conventions.
5. Run configured test command when needed.
6. Report violations with rule sources.

## NO COMMENTS IN TESTS
- ❌ Do NOT write explanatory comments inside tests (arrange/act/assert narration, "this is a regression guard", "unique per test", rationale notes). A comment explaining what a test should do signals a missing or non-deterministic assertion and masks flakiness.
- ✅ Make a test self-evident through names, the builder/fixture used, and explicit assertions. If intent needs explaining, rename or extract instead of commenting.
- ✅ Keep pre-existing XML doc comments on types; the ban is on explanatory inline comments in test bodies/helpers.

