# Olko Kotlin Security Overview

Check Kotlin security compliance for changed files, with marketplace defaults. This skill is read-only. It reports violations. It does not fix code.

## What I do
- Map changed `.kt`/`.kts` files, `AndroidManifest.xml`, and network security config files to Gradle module roots.
- Read security rules from `.agents/skill-config.md`, `.agents/skills/olko-kotlin-security/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `CODING_STYLE.md`.
- Check changed lines against the rule catalogue in `references/rules.md` and against documented project security rules.
- Run a configured security command when one exists.
- Report every violation with rule id, file, line, broken rule, and rule source.

## When to use
Use when validating Kotlin security, before commit/test gates, during plan review, or when `olko-kotlin-architecture`, `olko-commit-style`, `olko-test`, or `olko-plan-editor` delegates Kotlin security checks. Apply it to the same scope as `olko-kotlin-architecture`.

## Rule groups

| Group | Ids | Applies to |
|-------|-----|------------|
| Security | `S1`-`S4` | boundary code, config, manifests, network security config, logging calls |

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Load `.agents/skills/olko-kotlin-security/project.md`. |
| `kotlinSecurityCommand` | — | Optional command that runs security checks (for example a dependency audit or a static analyzer). |
| `kotlinSecurityRulesDisabled` | `[]` | Rule ids to skip, for example `[S2]`. |
| `kotlinProjectRoot` | nearest `gradlew` / `settings.gradle.kts` dir | Override the Gradle project root. |
| `kotlinGeneratedCodeDirs` | `build/`, generated protobuf/Route dirs | Directories excluded from checks. |
| `readArchitectureDocs` | `true` | Whether architecture and security docs may add or override rules. |

With no config and no adapter, all rules apply with the defaults above. Project-specific rule changes belong in `.agents/skill-config.md`, the project adapter, or `AGENTS.md`.

## Related skills
- `olko-kotlin-architecture` owns layout, boundaries, and client configuration. This skill owns the security rules.
