# Olko Python Testing Edge Cases

- Project test docs override marketplace defaults.
- Do not invent test framework requirements; use what `pyproject.toml` and docs configure.
- A test that reads config is acceptable only when the config value is critical for runtime behavior; otherwise it is a structure test and should be removed.
- Prefer extending existing tests with `@pytest.mark.parametrize` when setup and behavior path match.
