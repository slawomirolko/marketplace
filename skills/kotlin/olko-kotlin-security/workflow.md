# Olko Kotlin Security Workflow

This skill is read-only. Collect evidence with read and search tools. Run only the configured security command. Do not edit files.

## Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep:
- `.kt` / `.kts` files
- `AndroidManifest.xml`
- network security config files (`res/xml/network_security_config.xml` or the documented equivalent)

Skip `build/` outputs and `kotlinGeneratedCodeDirs`.

At plan time, the scope is the planned files and planned elements that the caller gives.

## Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-kotlin-security/project.md` when `projectAdapter` is not `false`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, `CODING_STYLE.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with a rule, follow the doc and report the conflict once. Do not report the finding. Remove every rule id in `kotlinSecurityRulesDisabled` from the check.

## Step 3 - Map project roots
For every changed file:
- find the nearest `gradlew` / `settings.gradle.kts` / `build.gradle.kts`, unless `kotlinProjectRoot` overrides it
- identify source sets (`main`, `debug`, `release`, `test`, `androidTest`) from the module layout or docs; `S3` depends on the source set

## Step 4 - Check rules with a coverage count
1. Load `references/rules.md`.
2. Set `total` to the number of rules that are not disabled. Set `checked` to `0`.
3. Check the scope against one rule. Add `1` to `checked` only after that rule is complete. A check with no finding counts.
4. Before you report, compare `checked` with `total`. If they differ, list the rule ids that you did not check. Do not report a complete check.

## Step 5 - Run security command when configured
If `kotlinSecurityCommand` exists, run it from the project root or documented working directory. If no command exists, do not invent one.

## Step 6 - Report result
If violations exist:

```text
Kotlin security violations (<checked>/<total> rules checked):
  1. <rule id> <file>:<line> - <rule broken> (source: <doc>:<section> | olko-kotlin-security:<rule id>)
Checks:
  1. <rule id> <file>:<line> - <finding>; <missing fact> (source: <doc>:<section> | olko-kotlin-security:<rule id>)
```

If a finding needs facts you do not have, report it as `check`, not as a violation. Name the missing fact. Do not guess. List it under `Checks:`. Leave out the `Checks:` block when there are none.

If the command fails, include the failing command and the smallest useful error snippet.

If clean:

```text
No Kotlin security violations found (<checked>/<total> rules checked).
```
