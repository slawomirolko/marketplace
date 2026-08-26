# Olko React Architecture Edge Cases

- Do not fix code unless the user or parent workflow asks for fixes.
- Skip generated files (`dist/`, generated OpenAPI/GraphQL types) per docs/config.
- Project docs override marketplace defaults; never hardcode package names, commands, or paths.
