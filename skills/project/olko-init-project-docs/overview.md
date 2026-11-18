# Olko Init Project Docs

## What I Do
- Create the project's decision store: ADRs, scoped rule files, and C4 architecture docs.
- Read the codebase without changing it and collect candidates: past decisions, rules the code already follows, and the system's structure.
- Grill the user about one candidate per turn, in the same question format as `grill-with-docs`.
- Write the files the user approved. Never commit.

## When To Use
- The project has no decision store yet.
- An agent wrote a minimal ADR because `<adrDirectory>/TEMPLATE.md` was missing and suggested this skill.
- The user asks to init or bootstrap project docs, or to add a missing part.

## Inputs
- The repository at the current working directory.
- Optional: one part to create (`adr`, `rules`, `architecture`).

## Adaptation
1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/olko-init-project-docs/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then this skill.
4. Use the defaults below when no higher layer overrides them.

## Configuration Keys
| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Load the project adapter. |
| `adrDirectory` | `docs/adr` | ADR files, `TEMPLATE.md`, and the `README.md` log. |
| `rulesDirectory` | `docs/rules` | Scoped rule files and the `README.md` table. |
| `architectureDirectory` | `docs/architecture` | `c4-context.md` and `c4-containers.md`, directly in this directory (no `c4/` subdirectory). |
| `initParts` | `adr, rules, architecture` | Parts this skill may create. |

## Store Format
```text
docs/
├── adr/
│   ├── README.md            log: | ADR | Title | Status | Topic | Scope |
│   ├── TEMPLATE.md
│   └── 0001-<slug>.md
├── rules/
│   ├── README.md            table: | File | Scope | Summary |
│   ├── general.md           scope: "**"
│   └── <name>.md            scope: path globs
└── architecture/
    ├── c4-context.md        C4 level 1
    └── c4-containers.md     C4 level 2
```

- ADRs use the Nygard sections (Status, Context, Decision, Consequences) plus Considered options. Consequences are `MUST` / `MUST NOT` / `SHOULD` statements (RFC 2119) about future code in the ADR's scope, followed by the trade-offs accepted.
- Each ADR starts with front matter. Agents read it instead of the full text:

  | Key | Required | Meaning |
  |-----|----------|---------|
  | `status` | yes | `Proposed`, `Accepted`, `Deprecated`, or `Superseded`. Same value as the log row. |
  | `topic` | yes | The question the ADR answers, dot-separated lowercase (`persistence.orm`). ADRs with the same topic answer the same question. |
  | `scope` | yes | Path globs the decision governs. Same globs as the log row. |
  | `decision` | yes | The decision in one line. |
  | `overrides` | no | ADR ids (`ADR-0004`) with the same topic and a broader scope that this ADR makes an exception to. |
  | `supersedes` | no | ADR ids this ADR replaces. Each of them has status `Superseded`. |
  | `enforcedBy` | yes | `none`, `archtest`, `lint`, or `ci`. Not `none` only when a test, lint rule, or CI check already fails on a violation. |
- One binding ADR per topic and path: two `Accepted` ADRs with the same `topic` and overlapping `scope` need an `overrides` link. Otherwise the store is invalid.
- An older ADR without front matter stays valid. Its id is its topic, and agents read it in full.
- Each rule file starts with front matter: `scope` (a list of path globs; `"**"` for all code) and `summary` (one line). The body is a list of `MUST` / `MUST NOT` / `SHOULD` rules.
- The ADR log's `Scope` column uses the same globs, so agents open only the ADRs and rule files that match the paths they touch.
- Check the store with `node <this skill directory>/check-store.mjs <project> [--adr <dir>] [--rules <dir>]`. Exit code 0: the store is valid. Exit code 1: the store has errors, one per line. Exit code 2: usage error.

## Defaults
- A re-run creates only missing files and never overwrites one.
- ADR filter (same as `grill-with-docs`): write an ADR only when the decision is hard to reverse, surprising without context, and the result of a real trade-off.
- A rule needs evidence in at least two places.
- Nothing is written before the user approves the exact text.
