# Olko Design Rules Overview

A read-only rule catalogue. It is not an executable workflow that changes files. A caller (a stack style skill, a plan editor, or a review agent) scans its scope against these rules and reports findings. This skill never calls `edit` or `write`.

## How to use

- This is a read-only catalogue. It never edits code.
- Treat React web and React Native as separate stacks. Route browser/Vite conventions to `olko-react-*` and native mobile conventions to `olko-react-native-*`; share a rule only when the matching stack skill or project docs cover it.
- The caller scans its scope, then reports each finding as `<rule id> <file>:<line> — <problem> — <fix>` with the source `olko-design-rules:<rule id>`.
- The caller decides which findings to fix.

## Rule groups

| Group | Ids | Stacks | When |
|-------|-----|--------|------|
| Design rules | D1-D9 | all | plan time and code time |
| Code rules | C1-C8 | all | code time only |
| .NET-only rules | N1-N3 | C# | code time only |

## Anchoring

- At plan time, anchor each finding to a planned file or a planned element (type, method, config key) in the plan.
- At code time, anchor each finding to a changed line (added or modified relative to the base). Do not flag untouched code, also when it is in a changed file.
- You can read code outside the scope to get evidence (for example, to find an existing helper). The anchor stays in the scope.

## Configuration keys

Read `.agents/skill-config.md` first. If `projectAdapter` is not `false`, load `.agents/skills/olko-design-rules/project.md` when it exists. Precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Load `.agents/skills/olko-design-rules/project.md`. |
| `designRulesDisabled` | `[]` | Rule ids to skip, for example `[C6, N1]`. |
| `designRulesMagicValueMinRepeats` | `2` | Minimum repeats in scope before C4 flags a literal. |
| `designRulesAllowedAbbreviations` | `Id`, `Url`, `Uri`, `Dto`, `Http`, `Json`, `Xml`, `Io`, `Ok`, `Db` | Abbreviations C2 does not flag. |

With no config and no adapter, all rules apply with the defaults above. Project-specific rule changes belong in `.agents/skill-config.md`, the project adapter, or `AGENTS.md`.

## Covered elsewhere (do not add here)

These source categories are already rules in the stack skills. Do not duplicate them in this catalogue.

| Category | Covered by |
|----------|------------|
| Method naming and single responsibility | `olko-dotnet-style`, `olko-python-style`, `olko-kotlin-style`, `olko-react-style`, `olko-react-native-style` |
| Overlong methods | `olko-dotnet-style` (30-line limit) |
| Inline comments | `olko-dotnet-style`, `olko-kotlin-style`, `olko-react-style`, `olko-dotnet-testing` |
| One type per file | `olko-dotnet-style`, `olko-python-style`, `olko-kotlin-style`, `olko-react-style` |
| Braces and other mechanical style | `olko-dotnet-style` and the stack format/lint commands |
| Test naming consistency | `olko-dotnet-testing`, `olko-python-testing`, `olko-kotlin-testing`, `olko-react-testing`, `olko-react-native-testing` |
| Test redundancy and coverage gaps | `olko-dotnet-testing`, `olko-python-testing`, `olko-kotlin-testing`, `olko-react-testing`, `olko-react-native-testing` |
| Project-doc conventions (`AGENTS.md`) | every stack style skill (adaptation layers) |

## Not adopted (project conventions — intentionally left out, do not re-add in syncs)

- `CancellationToken` parameter naming (short `ct` or full name): convention differs per project; each project's own style skill decides.
- `///` XML doc comments on methods: convention differs per project; each project's own style skill decides.
