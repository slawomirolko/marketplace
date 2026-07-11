---
name: olko-commit-style
description: "Check coding style compliance for changed files across stacks. Reads style rules from project docs (AGENTS.md, CODING_STYLE.md), runs the prescribed style tools per stack, and reports violations with their rule source. Use when olko-commit delegates style checking, or standalone to verify style on changed files."
---

# Olko Commit Style

## What I do
- Group changed files by stack using project markers (not hardcoded paths)
- Read style rules from the project's docs (nearest `AGENTS.md` / `CODING_STYLE.md` up the dir tree + repo root)
- Run the style tool those docs prescribe
- Cross-check changed files against documented architecture + style rules
- Report violations with the rule source (file + section)

## When to use me
- Called by `olko-commit` (declared in `uses`) to check style before committing
- Standalone: user says "check style", "lint this", "verify coding style"

## Optional dependencies (uses)

This skill may delegate stack-specific checks when declared in the project adapter (`.agents/skills/olko-commit-style/project.md`):

```yaml
uses:
  - olko-dotnet-style
  - olko-dotnet-architecture
  - olko-dotnet-testing
  - olko-docker-style
  - olko-python-architecture
  - olko-python-style
  - olko-python-testing
  - olko-kotlin-architecture
  - olko-kotlin-style
  - olko-kotlin-testing
```

If a dependency is not declared, run the built-in document-based checks below.

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `styleCommand` | — | Override style command. If absent, read from project docs. |

## Workflow

### Step 1 — Group changed files by stack

For each changed file, determine its stack using project markers (not fixed path prefixes):

| Stack | Markers |
|-------|---------|
| .NET | changed `.cs` / `.csproj`; belongs to nearest `*.csproj` |
| Docker | changed `Dockerfile*`, `*.Dockerfile`, `.dockerignore`, `compose*.yml`, `compose*.yaml`, `docker-compose*.yml`, `docker-compose*.yaml` |
| Python | changed `.py`; belongs to nearest `pyproject.toml` dir |
| Kotlin/Android | changed `.kt` / `.kts`; belongs to nearest `gradlew` dir |

If a changed file matches no known stack, skip it.

### Step 2 — Read style rules from project docs

For each stack group, walk up the directory tree from each changed file and read the nearest:
- `AGENTS.md`
- `CODING_STYLE.md`
- `TESTING.md` (if style rules reference test conventions)

Also read the repo root `AGENTS.md`. The docs are the **rule source of truth** — this skill does not encode rules itself.

### Step 3 — Run the prescribed style tool

Run the style tool the docs reference. Do NOT hardcode a tool — use what the docs prescribe.

- If the docs specify a command (e.g. `dotnet format --verify-no-changes`, `ruff check`, `./gradlew ktlintCheck`), run it from the discovered project root.
- If `styleCommand` is set in config, use it instead.
- If no linter is configured, the docs will say so; skip the linter and continue.

### Step 4 — Cross-check against documented rules

If a matching stack-specific skill is declared in `uses`, delegate the relevant changed files to it and follow its result:
- `.NET` style: `olko-dotnet-style`
- `.NET` architecture: `olko-dotnet-architecture`
- `.NET` test conventions: `olko-dotnet-testing`
- Docker conventions: `olko-docker-style`
- Python architecture: `olko-python-architecture`
- Python style: `olko-python-style`
- Python test conventions: `olko-python-testing`
- Kotlin/Android architecture: `olko-kotlin-architecture`
- Kotlin/Android style: `olko-kotlin-style`
- Kotlin/Android test conventions: `olko-kotlin-testing`

If no matching dependency is declared, inspect locally:

Inspect changed files against the architecture + style rules in the docs. Report any violations found, citing the source doc and section:

```
Style violations:
  1. <file>:<line> — <rule broken> (source: <AGENTS.md/CODING_STYLE.md>:<section>)
  2. ...
```

### Step 5 — Handle violations

If violations are found, ask the user:

- **"Fix style automatically (recommended)"** — run the auto-fix command the docs prescribe, then re-verify
- **"Skip style check"** — proceed with a visible warning
- **"Abort"** — stop

If auto-fix still fails, report remaining violations (with rule source) and stop — do not proceed.

If no violations: "No style violations found."

## Rules
- The rule source of truth is the referenced markdown file, not this skill. If a rule here ever contradicts a doc, the doc wins — surface the conflict to the user.
- Never hardcode project-specific commands, paths, or style rules — read them from docs or config
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-commit-style/project.md`
