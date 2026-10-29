---
name: olko-python-security
description: "Check Python security compliance for changed Python projects with marketplace defaults. Read-only. Reads project docs and adapters, maps changed .py and tracked .env template files to pyproject.toml roots, verifies credential placement in environment files, and reports violations with rule ids and sources. Use when validating Python security, before commit/test gates, during plan review, or when olko-python-architecture/olko-commit-style/olko-test/olko-plan-editor delegates Python security checks."
---

# olko-python-security

## Routing Summary
Check Python security compliance with marketplace defaults. Read-only. Maps changed `.py` files and tracked `.env` template files (`.env.example` or the documented equivalent) to `pyproject.toml` roots, checks them against the rule catalogue, and reports each violation with a rule id and a rule source. Apply it to the same scope as `olko-python-architecture`.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `references/rules.md` when the check starts.
- Load `examples.md` only when the report shape is needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what this skill checks, when to use it, rule groups, and configuration keys.
- `workflow.md` - ordered check workflow and report format.
- `references/rules.md` - rule catalogue: secrets `S1`-`S2`.
- `examples.md` - report output shape.
- `edge-cases.md` - strict rules and failure handling.
