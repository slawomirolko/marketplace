# Olko Test

## Edge Cases
## Rules
- Use the project's existing assertion/mock libraries (e.g. Shouldly/NSubstitute for .NET) — don't introduce new ones
- Never add skip logic to tests
- Never modify gRPC stubs or generated files
- Keep repo root as working directory; run stack commands with `--directory`/`--project` flags or from the discovered project root
- The compose file lives at the repo root — discover its name (`compose.yaml` or `docker-compose.yml`) rather than assuming one
- Follow the test tier strategy from the repo's docs (root `AGENTS.md` → `## TEST STRATEGY` if present, and per-stack `TESTING.md`/`Testing.md` if present):
  - Integration/e2e tests cover main happy paths and core workflows
  - Unit tests cover edge cases, error paths, boundaries
- When a test failure is in an integration test for an edge case, suggest moving it to a unit test where it belongs
- When a test failure is in a unit test for a main path, suggest adding an integration test covering that flow instead
