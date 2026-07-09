---
name: olko-python-style
description: "Check Python style compliance for changed Python files with marketplace defaults. Reads project docs and adapters, maps .py files to pyproject.toml roots, runs documented format/lint/type commands such as ruff/mypy/pyright when configured, checks common Python style expectations that docs enable, and reports violations with rule sources. Use when validating Python style, linting Python changes, before commit/test gates, or when olko-commit-style delegates Python style checks."
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
| `pythonStyleGeneratedGlobs` | `**/*_pb2.py`, `**/*_pb2_grpc.py`, `**/__pycache__/**`, `**/.venv/**` | Files skipped unless docs say otherwise. |
| `readArchitectureDocs` | `true` | Whether architecture docs may add style constraints. |
| `readTestingDocs` | `true` | Whether test docs may add test style constraints. |

## Marketplace defaults

Use these defaults only when config, adapter, or project docs do not override them:

```yaml
pythonStyleGeneratedGlobs:
  - "**/*_pb2.py"
  - "**/*_pb2_grpc.py"
  - "**/__pycache__/**"
  - "**/.venv/**"
readArchitectureDocs: true
readTestingDocs: true
```

These are reusable marketplace defaults. Project-specific naming rules, layer names, and custom commands belong in `.agents/skill-config.md`, `.agents/skills/olko-python-style/project.md`, or `AGENTS.md`.

## Default Python style rules

Apply these defaults unless config, adapter, or project docs override them.

### Functions and type hints
- Keep functions short and focused on one responsibility.
- Prefer explicit type hints on public functions and methods.
- Prefer explicit `async` methods for gRPC and network I/O.
- Do not mutate shared input dictionaries unless the contract says mutation is expected.
- Keep log output structured and consistent with the surrounding codebase.

### Generated code
- Do not edit generated gRPC stubs by hand (e.g. `*_pb2.py`, `*_pb2_grpc.py`).
- Keep generated stubs excluded from manual formatting and lint cleanup.
- Regenerate stubs through the documented generator script, not by hand.

### File creation
- Use `pathlib.Path` instead of `os.path`.
- Always use a `with` statement for file operations.
- Always specify `encoding="utf-8"` explicitly.
- Create parent directories with `mkdir(parents=True, exist_ok=True)`.
- Use atomic writes (temp file + rename) for critical data.
- Handle `OSError` exceptions gracefully.

### When to create a new class
- Encapsulate state and behavior together.
- Multiple independent instances are needed.
- Customizing via inheritance or composition.
- Lifecycle management is required (setup/cleanup).

### When to split to a new file
- File exceeds 300-500 lines.
- Different abstraction layers (I/O vs business logic vs presentation).
- Public vs private separation.
- Avoiding circular imports.
- One public class or cohesive function group per file.

### Single responsibility
- Class: one reason to change.
- Function: do one thing at one abstraction level.
- Module: one domain concept per file.
- Split when there are multiple answers to "what would make me edit this code?".
- Keep parsing, storage, business logic, and presentation separate.

### Silent failures — zero tolerance
- Never return `None`, empty dicts, empty lists, or silently skip processing when a required file/resource/config is missing.
- Never swallow exceptions and return an empty/default result without logging or raising.
- Never silently ignore mismatched key formats or missing env vars; fail fast with a clear error message.
- If a file is expected but missing, raise `FileNotFoundError` with the path in the message.
- If an env var or config key does not resolve, raise `ValueError` explaining which key was expected.
- If a key format convention (e.g. `__` to `:` mapping) is required, the result must be immediately verifiable; write a test that breaks when the mapping is missing.

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
Check rules found in docs/adapters/config plus marketplace defaults when docs do not override them. Common rule types to look for:
- import ordering beyond formatter config
- typing strictness and `Any`/cast rules
- async style and blocking-call restrictions
- exception/logging conventions
- `pathlib.Path` vs `os.path` and explicit `encoding` for file operations
- silent failures and fail-fast behavior for missing files/resources/config
- fixture, monkeypatch, and test naming conventions
- generated-code edit restrictions (e.g. `*_pb2.py`, `*_pb2_grpc.py`)

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
- Marketplace defaults are allowed here to avoid repeating standard Python style conventions per project.
- Never hardcode project-specific commands, paths, or style rules.
- Prefer documented project rules over generic Python opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
