---
name: olko-kotlin-security
description: "Check Kotlin/Android security compliance for changed Kotlin projects with marketplace defaults. Read-only. Reads project docs and adapters, maps changed .kt/.kts files, Android manifests, and network security config to Gradle module roots, verifies boundary input validation, secret storage, cleartext traffic limits, and sensitive-data logging, and reports violations with rule ids and sources. Use when validating Kotlin/Android security, before commit/test gates, during plan review, or when olko-kotlin-architecture/olko-commit-style/olko-test/olko-plan-editor delegates Kotlin security checks. Triggers: 'kotlin security', 'android security check', 'cleartext traffic', 'secret in kotlin code', 'olko-kotlin-security'."
---

# olko-kotlin-security

## Routing Summary
Check Kotlin security compliance with marketplace defaults. Read-only. Maps changed `.kt`/`.kts` files, `AndroidManifest.xml`, and network security config files to Gradle module roots, checks them against the rule catalogue, and reports each violation with a rule id and a rule source. Apply it to the same scope as `olko-kotlin-architecture`.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `references/rules.md` when the check starts.
- Load `examples.md` only when the report shape is needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what this skill checks, when to use it, rule groups, and configuration keys.
- `workflow.md` - ordered check workflow and report format.
- `references/rules.md` - rule catalogue: security `S1`-`S4`.
- `examples.md` - report output shape.
- `edge-cases.md` - strict rules and failure handling.
