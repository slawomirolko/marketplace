# Olko Kotlin Testing Edge Cases

- Project test docs override marketplace defaults.
- Do not invent test framework requirements; use what `build.gradle.kts`, the version catalog, and docs configure.
- A test that reads config is acceptable only when the config value is critical for runtime behavior; otherwise it is a structure test and should be removed.
- Prefer extending existing tests with parametrization when setup and behavior path match.
- `BUILD SUCCESSFUL` followed by a shell timeout on `./gradlew test` (Windows config cache) is a pass, not a failure — kill the daemon and move on.
