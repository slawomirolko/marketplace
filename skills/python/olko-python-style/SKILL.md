---
name: olko-python-style
description: "Check Python style compliance for changed Python files. Reads project docs and adapters, maps .py files to pyproject.toml roots, runs documented format/lint/type commands such as ruff/mypy/pyright/pytest-style gates when configured, and reports violations with rule sources. Use when validating Python style, linting Python changes, before commit/test gates, or when olko-commit-style delegates Python style checks."
---

# Olko Python Style

## What I do
- Map changed `.py` files to their nearest Python project root.
- Read style rules from `.agents/skill-config.md`, `.agents/skills/olko-python-style/project.md`, scoped `AGENTS.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Run the documented Python style command.
- Inspect changed files against documented style rules that tools cannot enforce.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `pythonStyleCommand` | — | Command to verify Python style. |
| `pythonStyleFixCommand` | — | Command to auto-fix Python style. |
| `pythonProjectRoot` | nearest `pyproject.toml` | Override project root. |

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.py` files. Skip generated files only when docs say they are not manually edited.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-python-style/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map Python roots
For every changed file:
- find nearest `pyproject.toml`, unless `pythonProjectRoot` overrides it
- group files by Python root
- identify the working directory from config, adapter, or docs

### Step 4 - Run style command
Run `pythonStyleCommand` when configured.

If no config command exists, use the command documented in `AGENTS.md` / `CODING_STYLE.md` / `TESTING.md`.

If docs name a tool but not a command, infer the narrow verify command only for standard project-local tools already configured in `pyproject.toml`:
- `ruff check`
- `ruff format --check`
- `mypy`
- `pyright`

Do not install tools or add config.

### Step 5 - Inspect documented style rules
Check only rules found in docs/adapters/config. Common rule types to look for when documented:
- import ordering beyond formatter config
- typing strictness and `Any`/cast rules
- async style and blocking-call restrictions
- exception/logging conventions
- fixture, monkeypatch, and test naming conventions
- generated-code edit restrictions

### Step 6 - Handle violations
If violations exist and `pythonStyleFixCommand` is configured or documented, ask before running it unless the parent workflow already authorized auto-fix.

If reporting:

```text
Python style violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No Python style violations found.
```

## Rules
- Never hardcode project-specific commands, paths, or style rules.
- Prefer documented project rules over generic Python opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
