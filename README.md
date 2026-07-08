# Marketplace

Catalog of opencode skills served via `registry.json`.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.


## Usage 
openskills install https://github.com/slawomirolko/marketplace --universal

## Registry maintenance

Validate the root registry and generated category indexes:

```powershell
node scripts/registry.mjs
```

Regenerate registry metadata and `skills/<category>/index.json` files:

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

Run all marketplace tooling tests:

```powershell
node --test scripts/*.test.mjs
```
