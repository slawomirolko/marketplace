# Olko Adapt To Marketplace

## Examples
Load this file only when concrete output shape, prompt wording, or command examples are needed.

## Full registry entry — single progressive skill

```json
{
  "name": "olko-test",
  "category": "testing",
  "version": "1.0.0",
  "description": "Run affected or all tests for .NET, Python, and Android/Kotlin with change-aware scope detection. Triggers: 'run tests', 'run affected tests', 'olko-test'.",
  "tags": ["testing", "test"],
  "capabilities": ["testing", "testing.test"],
  "cost": 2,
  "files": ["SKILL.md", "edge-cases.md", "examples.md", "overview.md", "workflow.md"],
  "loading": {
    "mode": "progressive",
    "first": "overview.md",
    "sections": ["overview", "workflow", "examples", "edge-cases"]
  }
}
```

Note: `uses`, `dependencies`, `runtimeDependencies` are **never** present — they belong in the skill body / project adapter, and `registry.mjs` rejects them in entries.

## Full registry entry — single-file skill (≤ 100 lines)

```json
{
  "name": "olko-commit-style",
  "category": "any",
  "version": "1.0.0",
  "description": "Check coding style compliance for changed files. Triggers: 'check style', 'olko-commit-style'.",
  "tags": ["any", "commit", "style"],
  "capabilities": ["any", "any.commit.style"],
  "cost": 1,
  "files": ["SKILL.md"]
}
```

No `loading` block — the skill is small enough to ship as one file.

## Split decomposition output

```
Skill super-tester → split into 4 skills:

Parent:
  olko-test              skills/testing/   progressive   uses: [olko-test-dotnet, olko-test-python, olko-test-kotlin]

Sub-skills:
  olko-test-dotnet       skills/dotnet/    single
  olko-test-python       skills/python/    single
  olko-test-kotlin       skills/testing/   single
```

## Regenerate + validate commands

```powershell
node scripts/registry.mjs --fix
node scripts/registry.mjs
node --test scripts/*.test.mjs
```

Expected success output: `registry ok: N skills`.

## Optimization table shape

```
## Optimization analysis for olko-<name>

### Token reduction
| # | Location  | Finding                                | Suggestion        |
|---|-----------|----------------------------------------|-------------------|
| 1 | SKILL.md  | restates Layered Adaptation verbatim   | Drop section      |
| 2 | overview  | 60 lines                               | Push detail to workflow |

### Routing quality
| # | Location    | Finding                       | Suggestion                          |
|---|-------------|-------------------------------|-------------------------------------|
| 3 | description | no triggers                   | Add Triggers: '...'                 |
| 4 | capabilities| flat, no hierarchy            | Normalize to [cat, cat.scope]       |

### Marketplace contribution
| # | Finding                                  | Suggestion                          |
|---|------------------------------------------|-------------------------------------|
| 5 | undocumented config key 'testFramework'  | Add to marketplace skill docs       |
```
