# Olko Docker Style Edge Cases

- Project Docker docs override marketplace defaults.
- Non-production Dockerfiles only get relevant rules; report which production-only checks were skipped.
- Do not invent service names, health paths, or ports.
- Do not build images or restart services unless the parent workflow asks for it.
- .NET Dockerfile rules stay here; C# code rules stay in .NET skills.
