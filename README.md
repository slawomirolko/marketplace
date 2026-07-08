# Marketplace

Catalog of opencode skills served via `registry.json`.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.


## Usage 
openskills install https://github.com/slawomirolko/marketplace --universal

## Registry maintenance

Validate the root registry, generated category indexes, and capability graph:

```powershell
node scripts/registry.mjs
```

Regenerate registry metadata, `skills/<category>/index.json` files, and `capability-graph.json`:

```powershell
node scripts/registry.mjs --fix
```

Run registry script tests:

```powershell
node --test scripts/registry.test.mjs
```

Route a request through metadata only, preferably through a category index first:

```powershell
node scripts/route-skill.mjs --category testing --intent "run affected tests" --limit 5
```

Create a bounded context loading plan for a skill and any explicit `uses` dependencies declared in `.agents/skills/<skill-name>/project.md`:

```powershell
node scripts/context-plan.mjs --skill olko-commit --budget 4000
```

Run all marketplace tooling tests:

```powershell
node --test scripts/*.test.mjs
```
