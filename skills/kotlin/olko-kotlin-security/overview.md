# Olko Kotlin Security Overview

Check Kotlin security compliance for changed files, with marketplace defaults.

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

With no config and no adapter, all rules apply with the defaults above. Project-specific rule changes belong in `.agents/skill-config.md`, the project adapter, or `AGENTS.md`.

## Related skills
- `olko-kotlin-architecture` owns layout, boundaries, and client configuration. This skill owns the security rules.
