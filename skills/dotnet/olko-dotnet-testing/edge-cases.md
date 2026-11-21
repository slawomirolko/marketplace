# Olko Dotnet Testing Edge Cases

- Project docs override marketplace defaults; name the conflict when they do.
- Do not add skip logic for missing infrastructure: keep the test executable and report the real failure, including the external status code, in the result.
- An integration test that fails on an external network dependency (an HTTP 403/407 from a third-party site) is a visible environmental failure, not a reason to convert the test to a skip; report it separately from the change under review.
- AAA markers are required even when the test is one act line and one assert line; a missing marker is a violation, not a style preference.
- A test-only builder may live in production behind `InternalsVisibleTo` when several test projects need the same shape; otherwise keep it in that test project's setup folder and do not copy it into a second project.
- `dotnet test --no-build` against a project that was not rebuilt reports stale results; restore and build before trusting a green or red run.
