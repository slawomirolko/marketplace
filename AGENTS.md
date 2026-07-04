# Marketplace

Catalog of opencode skills, optimized for opencode, served via `registry.json`.

## Skill naming convention

See [`docs/naming.md`](docs/naming.md).

## Layered Skill Adaptation Pattern

See [`docs/layered-skill-adaptation.md`](docs/layered-skill-adaptation.md).

## Skill Adaptation Contract

Every marketplace skill must be adaptable by design. See [`docs/skill-adaptation-contract.md`](docs/skill-adaptation-contract.md).

## Explicit Skill Reuse

Skills are isolated by default; reuse requires explicit `uses` declarations. See [`docs/explicit-skill-reuse.md`](docs/explicit-skill-reuse.md).

## Registry format

`registry.json` extends the opencode Index shape (`{ skills: [{ name, files, version? }] }`) with a `category` field matching the `skills/<category>/` folder. Only list skills whose `SKILL.md` has valid frontmatter (`name` + `description`); exclude empty stubs.

## Serving

opencode discovery fetches `<base>/index.json` and files from `<base>/<name>/<file>`. Split `registry.json` into per-category `index.json` files (or expose one URL per category in `skills.urls`) before serving.
