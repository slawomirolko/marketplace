# Olko Docker Style Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed Dockerfile, `.dockerignore`, and Compose files.
2. Load config, adapter, Docker docs, scoped docs, and root `AGENTS.md`.
3. Map Docker context roots and Compose service build contexts.
4. Run configured Docker style command and `docker compose config` for changed Compose files.
5. Inspect Dockerfile, `.dockerignore`, and Compose convention rules.
6. Report violations with rule sources.
