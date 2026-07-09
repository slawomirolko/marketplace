---
name: olko-python-architecture
description: "Check Python architecture compliance for changed Python projects. Reads project docs and adapters, maps changed .py files to pyproject.toml roots, verifies package boundaries, dependency direction, generated-code ownership, import rules, and reports violations with rule sources. Use when validating Python architecture, before commit/test gates, during plan review, or when olko-commit-style/olko-test/olko-plan-editor delegates Python architecture checks."
---

# Olko Python Architecture

## What I do
- Map changed `.py` files to their nearest Python project root.
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-python-architecture/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Inspect imports, package boundaries, generated files, and dependency direction against documented rules.
- Run configured architecture/import checks when present.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `pythonArchitectureCommand` | — | Command to run Python architecture checks. |
| `pythonProjectRoot` | nearest `pyproject.toml` | Override project root. |
| `readArchitectureDocs` | `true` | Whether to read architecture docs. |

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.py` files. Skip generated files only when docs identify them as generated and outside manual-edit scope.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-python-architecture/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map Python roots
For every changed file:
- find nearest `pyproject.toml`, unless `pythonProjectRoot` overrides it
- identify source roots/packages from `pyproject.toml`, existing package layout, or docs
- identify test package and generated-code directories only from docs/config or established repo layout

### Step 4 - Inspect architecture
Check only documented rules. Common rule types to look for when documented:
- import direction between packages/layers
- feature/module boundary crossings
- application/domain/infrastructure separation
- sync/async boundary rules
- generated file ownership, especially stubs and client code
- no business logic in transport/CLI/API adapters
- dependency injection/config boundary rules
- test fixture and monkeypatch boundaries when architecture docs include test rules

Use Python AST/import parsing where practical for imports. Avoid brittle text-only checks.

### Step 5 - Run architecture command when configured
If `pythonArchitectureCommand` exists, run it from the Python project root or documented working directory.

If no command exists, do not invent one. Continue with document-based inspection.

### Step 6 - Report result
If violations exist:

```text
Python architecture violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If command checks fail, include the failing command and the smallest useful error snippet.

If clean:

```text
No Python architecture violations found.
```

## Rules
- Never hardcode project-specific package names, commands, or paths.
- Prefer documented project rules over generic Python opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
