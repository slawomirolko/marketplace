# Olko Update AI Tech Docs Examples

Approval report shape:

```text
## Gap Analysis for: Kotlin Android

### 1. app/AGENTS.md - Suggested additions
- Gradle command ownership - document exact wrapper command and timeout behavior.
- Compose UI test rule - add when instrumentation tests are required.

### 2. app/Testing.md (NEW) - Proposed content
- Unit vs instrumentation split.
- MockK/fake boundaries.
- No skipped tests policy.

Approve: all, partial, or skip all?
```

Result shape:

```text
Done. Changes made:

| File | Action |
|---|---|
| app/AGENTS.md | Added Gradle command ownership |
| app/Testing.md | NEW - unit/instrumentation split, no-skip policy |
```
