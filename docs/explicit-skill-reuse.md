# Explicit Skill Reuse

Skills are isolated by default. This document defines the only way one
marketplace skill may reuse another.

It complements the [Layered Skill Adaptation Pattern](layered-skill-adaptation.md)
and the [Skill Adaptation Contract](skill-adaptation-contract.md). It is
implementation-agnostic and targets any AI coding agent that follows the
universal `.agents` convention.

## Principles

- Skills are isolated by default.
- A skill **must not** load another skill automatically.
- A skill **may** reuse another skill only when this dependency is declared
  explicitly.

## Dependency Declaration

Dependencies are declared with `uses` in the **project adapter**:

```yaml
uses:
  - testing-python
```

`uses` is a list of marketplace skill names. Each entry must match the
`<skill-name>` of another skill's adapter directory.

`uses` lives in the project adapter (`.agents/skills/<skill-name>/project.md`),
not in `.agents/skill-config.md`. It is a per-skill composition concern, not a
project-wide configuration concern.

## Resolution Rule

When executing a skill:

1. Load the active skill.
2. Load its project adapter:
   - `.agents/skills/<skill-name>/project.md`
3. Check `uses`.
4. Load only the explicitly declared dependent skills.
5. Do not load unrelated skills.

Dependent skills are loaded with the same rules as any skill: they read
`.agents/skill-config.md`, may have their own project adapter, and follow the
precedence defined in the Layered Skill Adaptation Pattern. Dependency loading is
recursive only when a dependent skill itself declares `uses`; cycles must be
detected and refused.

## Example

```text
.agents/
└── skills/
    ├── testing/
    │   └── project.md
    └── testing-python/
        └── project.md
```

```yaml
# .agents/skills/testing/project.md

uses:
  - testing-python
```

```yaml
# .agents/skills/testing-python/project.md

testCommand: "uv run pytest"
workingDirectory: "python"
testPaths:
  - "tests"
```

## Rule

- Default behavior: isolated skills.
- Reusable behavior: explicit dependencies only.

This optimizes context usage while still allowing skill composition.
