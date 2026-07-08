# Marketplace

Catalog of opencode skills served via `registry.json`.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.


## Usage 
openskills install https://github.com/slawomirolko/marketplace --universal

## Workflow

Initialize project context in a consuming project:

```powershell
node scripts/context-store.mjs init --project <path>
```

Route a request through metadata only, preferably through a category index first. Output includes score, confidence, and reasons:

```powershell
node scripts/route-skill.mjs --category testing --intent "run affected tests" --limit 5
```

Create a bounded context loading plan for a skill and any explicit `uses` dependencies declared in `.agents/skills/<skill-name>/project.md`:

```powershell
node scripts/context-plan.mjs --skill olko-test --project <path> --budget 4000
```

Create a full execution plan that combines routing, explicit `uses`, context sources, selected examples, compression files, and parallel work metadata:

```powershell
node scripts/skill-execution-plan.mjs --intent "run affected tests" --project <path> --category testing
```

Context compression files:

- `.agents/context/scratchpad/current.json` is temporary and overwritten
- `.agents/context/summaries/latest.md` is the default compressed context
- `.agents/context/summaries/archive/` keeps summaries up to the configured limit
- `.agents/context/memory/<skill>.md` stores durable project-specific skill knowledge

### Gitignore recommendation for consuming projects

The `.agents/context/` directory lives in the consuming project, not in this marketplace. Commit durable knowledge, ignore regenerable state:

```gitignore
# Regenerable per-task state — ignore
.agents/context/scratchpad/
.agents/context/summaries/
.agents/context/cache/

# Durable project-specific skill knowledge — commit
!.agents/context/memory/
```

`memory/<skill>.md` holds accumulated knowledge about how a skill applies to the project (e.g. test command, framework). Committing it benefits the whole team; the scratchpad, summaries, and cache are overwritten or regenerated and should stay local. If you prefer fully reproducible rebuilds via `conventionDiscovery`, ignore all of `.agents/context/` instead.

## Registry maintenance

Validate the root registry, generated category indexes, capability graph, and search index:

```powershell
node scripts/registry.mjs
```

Regenerate registry metadata, `skills/<category>/index.json` files, `capability-graph.json`, and `search-index.json`:

```powershell
node scripts/registry.mjs --fix
```

Run registry script tests:

```powershell
node --test scripts/registry.test.mjs
```

Run all marketplace tooling tests:

```powershell
node --test scripts/*.test.mjs
```
