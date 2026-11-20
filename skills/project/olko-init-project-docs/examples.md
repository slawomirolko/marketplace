# Examples

## A grill question

```text
Problem: the scan found that timestamps are stored and returned in UTC and converted only in the UI.
  Would write docs/adr/0001-utc-timestamps.md:
  Decision: the system stores and transports every timestamp in UTC; the UI converts to local time.
  Consequences:
  - Persistence and API code MUST NOT store or return local-time values.
  - UI code MUST convert to the user's time zone at display time.
  - Trade-offs: reports need an explicit time-zone parameter.
  Evidence: src/Persistence/Mappings.cs:22, src/Api/Serialization.cs:15, web/src/date.ts:8
Why I am asking: without a record, review cannot flag new code that returns local time.
Options:
  1. Record as written (recommended: three layers already follow it; one local-time value breaks sorting)
     Business: review flags local-time values in persistence and API code.
     Change scope: docs/adr/0001-utc-timestamps.md + one log row.
  2. Record with your wording
     Business: same check, your text.
     Change scope: same files.
  3. Skip
     Business: nothing is checked.
     Change scope: no change.
Glossary: UTC — time without a time-zone offset.
```

## ADR log

```markdown
| ADR | Title | Status | Topic | Scope |
|---|---|---|---|---|
| 0001 | UTC timestamps | Accepted | time.storage | `src/**`, `web/src/**` |
| 0004 | EF Core for data access | Accepted | persistence.orm | `src/**` |
| 0007 | Dapper in the reports module | Accepted | persistence.orm | `src/Reports/**` |
| 0011 | Raw ADO.NET for data access | Superseded by 0004 | persistence.orm | `src/**` |
```

## ADR front matter

```markdown
---
status: Accepted
topic: persistence.orm
scope: ["src/Reports/**"]
decision: "The reports module reads data with Dapper, not EF Core."
overrides: [ADR-0004]
enforcedBy: archtest
---

# 0007. Dapper in the reports module
```

ADR-0004 (`src/**`) and ADR-0007 (`src/Reports/**`) have the same topic and overlapping scopes. The store is still valid: ADR-0007 `overrides` ADR-0004, so for a file in `src/Reports/` ADR-0007 binds, and for every other file in `src/` ADR-0004 binds. ADR-0004 has `supersedes: [ADR-0011]`.

## Rule file

```markdown
---
scope: ["src/**/Persistence/**"]
summary: Data access in the persistence layer.
---

- Queries MUST go through repository interfaces; handlers MUST NOT use the database context directly.
- Migrations SHOULD be additive; a destructive change MUST include a data migration.
```

## Rules table

```markdown
| File | Scope | Summary |
|---|---|---|
| general.md | `**` | Rules for all code. |
| persistence.md | `src/**/Persistence/**` | Data access in the persistence layer. |
```

## C4 containers

```markdown
- Web app → API: HTTPS/JSON
- API → Database: SQL
- API → Message broker: AMQP (publishes order events)
```
