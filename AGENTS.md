# Marketplace

## Docs

- [Naming](docs/naming.md) — `olko-` prefix required
- [Layered Skill Adaptation Pattern](docs/layered-skill-adaptation.md)
- [Skill Adaptation Contract](docs/skill-adaptation-contract.md) — every skill must be adaptable by design
- [Explicit Skill Reuse](docs/explicit-skill-reuse.md) — isolated by default; reuse needs explicit `uses`

## Registry format

`registry.json` adds a `category` field (matching `skills/<category>/`). Only list skills with valid `SKILL.md` frontmatter (`name` + `description`); exclude empty stubs.

## Serving

Split `registry.json` into per-category `index.json` files (or expose one URL per category in `skills.urls`) before serving.
