# Workflow

## 1. Plan the run
1. Apply the adaptation order from `overview.md`. Resolve the three directories and `initParts`.
2. List the store files that already exist. Plan only the missing files and entries.
3. Tell the user in one message what this run creates and what already exists.

## 2. Collect candidates (read only)
Read build and package manifests, project files, deployment and runtime configuration, entry points, and a sample module per area. Run nothing and change nothing.

- **Decision candidates**: choices visible in the code that pass the ADR filter in `overview.md`. Note the evidence (`file:line`) and the paths the decision governs, as globs.
- **Rule candidates**: conventions that hold in at least two places, for example layering, naming, error handling, validation, test layout, or logging. Group them by the paths they apply to; a convention for all code goes to `general.md`.
- **Structure candidates**: the system, its users, the external systems it talks to, and its containers (applications, services, workers, data stores, message brokers) with the protocol of each connection, at C4 levels 1 and 2.

Discard a candidate that you cannot back with evidence.

## 3. Grill, one candidate per turn
Order: decisions, then rules, then structure. Every question uses the `grill-with-docs` question content, in this order:
1. **Problem** — the candidate text exactly as it would be written, its target file, and the `file:line` evidence.
2. **Why I am asking** — what agents will or will not check if nobody decides.
3. **Options** — exactly 3, the recommendation first with a one-line reason:
   1. record as written;
   2. record with the user's wording;
   3. skip.
4. Per option, both consequences: **Business** (what agents check from now on) and **Change scope** (which file and line changes, or "no change").
5. **Glossary** — every domain term in one clause.

Use the `question` tool when available; otherwise numbered prose, and accept a single digit. Use reworded text verbatim. Record each answer before the next question. A skipped candidate is not stored.

For a rule, confirm its `scope` globs in the same question. A rule whose only honest scope is all code goes to `general.md`.

Finish by asking once whether the user wants to add anything the scan missed.

## 4. Write
Write approved content only, into missing files (re-runs: `edge-cases.md`). Shapes are in `examples.md`.

- `<adrDirectory>/TEMPLATE.md`: `# NNNN. <title>`, `Date:`, `Status:`, then `## Context`, `## Considered options`, `## Decision`, `## Consequences`.
- `<adrDirectory>/NNNN-<slug>.md`: one per approved decision; number = highest existing + 1, four digits. Consequences: `MUST` / `MUST NOT` / `SHOULD` statements, then `Trade-offs:`. Name modules and layers, not single files or classes.
- `<adrDirectory>/README.md`: one-paragraph purpose, the ADR filter, the consequence style, and the log `| ADR | Title | Status | Scope |`. Status: `Proposed`, `Accepted`, `Deprecated`, or `Superseded by NNNN`. Add the log row together with the ADR.
- `<rulesDirectory>/<name>.md`: front matter `scope` and `summary`, then the rule list.
- `<rulesDirectory>/README.md`: one-paragraph purpose and `| File | Scope | Summary |`, one row per rule file.
- `<architectureDirectory>/c4-context.md` and `c4-containers.md`: one bullet per element and per connection; no component-level detail.

Store files contain the approved text only, never the evidence.

## 5. Finish
1. Directories differ from the defaults → propose the keys for `.agents/skill-config.md`; write them after approval.
2. Report the created files, the number of entries in each, and the number of skipped candidates. The user reviews and commits.
