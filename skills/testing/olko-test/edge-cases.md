# Olko Test

## Edge Cases
## Rules
- In a linked Git worktree, never use the main Compose project, its ports, or an unqualified Compose command.
- Worktree Compose cleanup belongs in `finally` and is scoped to the isolated `COMPOSE_PROJECT_NAME`.
- If no `.agents/skill-config.md` exists, use marketplace defaults and discover commands from repo docs.
- If `projectAdapter: false`, do not load `.agents/skills/olko-test/project.md`.
- Do not auto-load stack-specific skills; load them only when `.agents/skills/olko-test/project.md` declares them in `uses`.
- Use the project's existing assertion/mock libraries (e.g. Shouldly/NSubstitute for .NET) — don't introduce new ones
- Never add skip logic to tests
- Never modify gRPC stubs or generated files
- Keep repo root as working directory; run stack commands with `--directory`/`--project` flags or from the discovered project root
- The compose file lives at the repo root — discover its name (`compose.yaml` or `docker-compose.yml`) rather than assuming one
- Follow the test tier strategy from the repo's docs (root `AGENTS.md` → `## TEST STRATEGY` if present, and per-stack `TESTING.md`/`Testing.md` if present):
  - Integration/e2e tests cover main happy paths and core workflows
  - Unit tests cover edge cases, error paths, boundaries
- When a test failure is in an integration test for an edge case, suggest moving it to a unit test where it belongs
- Detect linked worktrees from Git metadata, not directory-name heuristics.
- Defaults are `scripts/tests/worktree-compose.ps1` and `scripts/tests/worktree-compose*.ps1`; adapter/configuration may override them.
- Pass the same worktree path, isolated project name, env file, and port offset to startup, every test script, and teardown.
- Missing Docker, missing services, wrapper errors, port collisions, and test errors are failures. Never add skip, xfail, or silent-success branches.
- If startup fails, attempt scoped teardown anyway. Preserve a real test failure as primary when teardown also fails.
- When a test failure is in a unit test for a main path, suggest adding an integration test covering that flow instead
- Missing wrapper or matching scripts is not an error; preserve normal .NET, Python, and Kotlin/Android paths.
