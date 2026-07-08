# Olko Investigate Existing

## Overview

## What I do
- Find a mechanism by name or description
- Analyze its behavior end-to-end
- Produce a flow graph of directories and classes involved
- Verify and update per-slice AGENTS.md documentation (only non-inferable content)
- Assess optimization/extension opportunities and predict potential errors
- Summarize findings and, for each improvement, offer to create a plan via a declared plan skill

## When to use me
User says "investigate X", "analyze how Y works", "explain the Z flow", "document mechanism A", or invokes `/olko-investigate-existing <name>`.

## Dependencies (uses)

This skill integrates with two optional skills. Declare them in `uses` in the project adapter (`.agents/skills/olko-investigate-existing/project.md`):

```yaml
uses:
  - olko-plan-editor       # delegate improvement-plan creation
  - olko-agents-optimizer  # AGENTS.md content methodology
```

- If a **plan skill** (e.g. `olko-plan-editor`) is declared, delegate plan creation to it (Step 6). If not declared, skip plan creation and present the summary only.
- If an **agents-optimizer skill** (e.g. `olko-agents-optimizer`) is declared, follow its methodology for AGENTS.md content decisions (Step 4). If not declared, apply the universal rule below.
- Universal AGENTS.md rule: only suggest **non-inferable** content (naming quirks, cross-boundary rules, custom tooling commands, optional wiring). Never add overviews, flow diagrams, property tables, dependency lists, file indexes, or test tables.

If neither skill is declared, this skill still runs end-to-end; it skips plan creation and uses the universal AGENTS.md rule. Do not auto-load skills — composition is explicit through `uses`. See [Explicit Skill Reuse](../../docs/explicit-skill-reuse.md).

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `conventionDiscovery` | `false` | When `true`, inspect the repo to infer file types, project markers, and conventions not stated in config or AGENTS.md. When `false`/absent, rely on config + AGENTS.md + the Project Adapter only (user may explicitly request repo inspection for a turn). |
| `readArchitectureDocs` | marketplace default | Hints that architecture/style docs should be read and checked when assessing architecture compliance (Step 5). |
| `readTestingDocs` | marketplace default | Hints that testing docs should be read when assessing test reuse (Step 2 / Step 5). |

Layer control flags are documented in the [Layered Skill Adaptation Pattern](../../docs/layered-skill-adaptation.md). The plan file location is project-specific — never hardcode a path; let the declared plan skill name it or read it from the project adapter.

### Default behavior (when no adapter / no `uses` / no config)

- AGENTS.md verification uses the universal non-inferable-content rule.
- Architecture compliance reads whatever `AGENTS.md` / `CODING_STYLE.md` it discovers by walking the tree.
- No plan files are created; the summary is presented in chat only.

## Resolution order

1. Load `.agents/skill-config.md` (apply marketplace defaults if absent).
2. If `conventionDiscovery == true`, inspect the repo to infer conventions not stated in config. Skip when `false` or absent.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-investigate-existing/project.md`. Skip when `false` or the file is absent.
5. Execute this skill with the accumulated context.

Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
