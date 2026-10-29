# Olko Python Security Overview

Check Python security compliance for changed files, with marketplace defaults. This skill is read-only. It reports violations. It does not fix code.

## What I do
- Map changed `.py` files and tracked `.env` template files (`.env.example` or the documented equivalent) to `pyproject.toml` roots.
- Read security rules from `.agents/skill-config.md`, `.agents/skills/olko-python-security/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `CODING_STYLE.md`.
- Check changed lines against the rule catalogue in `references/rules.md` and against documented project security rules.
- Run a configured security command when one exists.
- Report every violation with rule id, file, line, broken rule, and rule source.

## When to use
Use when validating Python security, before commit/test gates, during plan review, or when `olko-python-architecture`, `olko-commit-style`, `olko-test`, or `olko-plan-editor` delegates Python security checks. Apply it to the same scope as `olko-python-architecture`.

## Rule groups

| Group | Ids | Applies to |
|-------|-----|------------|
| Secrets | `S1`-`S2` | environment files and the settings module that loads them |

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Load `.agents/skills/olko-python-security/project.md`. |
| `pythonSecurityCommand` | — | Optional command that runs security checks (for example a dependency audit or a static analyzer). |
| `pythonSecurityRulesDisabled` | `[]` | Rule ids to skip, for example `[S2]`. |
| `pythonProjectRoot` | nearest `pyproject.toml` | Override the Python project root. |
| `pythonGeneratedCodeDirs` | generated gRPC stub dirs (e.g. `*_pb2*`) | Directories excluded from checks. |
| `readArchitectureDocs` | `true` | Whether architecture and security docs may add or override rules. |

With no config and no adapter, all rules apply with the defaults above. Project-specific rule changes belong in `.agents/skill-config.md`, the project adapter, or `AGENTS.md`.

## Related skills
- `olko-python-architecture` owns layout, boundaries, and client configuration. This skill owns the security rules.
