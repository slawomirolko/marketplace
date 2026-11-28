# Marketplace

## Docs

- [Naming](docs/naming.md) — `olko-` prefix required for authored skills; vendored skills keep upstream names with `origin: vendored`
- [Layered Skill Adaptation Pattern](docs/layered-skill-adaptation.md)
- [Skill Adaptation Contract](docs/skill-adaptation-contract.md) — every skill must be adaptable by design
- [Explicit Skill Reuse](docs/explicit-skill-reuse.md) — isolated by default; reuse needs explicit `uses`
- [Project Change Upstream](docs/project-change-upstream.md) — lock, watch and draft PR flow for local changes to installed artifacts

## Scripts and tests

- Root `scripts/` holds marketplace scripts and every Node test (`scripts/*.test.mjs`), also the tests of skill scripts. Skill folders hold no tests, so an install never ships one. Run `node --test scripts/*.test.mjs`.
- Root scripts may share `scripts/lib/`. Skill scripts stay self-contained (Node built-ins and files of the same skill only); they never import root code.
- A skill script that needs the marketplace checkout or the factory takes `--marketplace` / `--factory` (or `FACTORY_MARKETPLACE_DIR`) when it is not inside a checkout, and fails with a clear message otherwise.

## Registry format

`registry.json` adds a `category` field (matching `skills/<category>/`). Only list skills with valid `SKILL.md` frontmatter (`name` + `description`); exclude empty stubs. Vendored skills add `origin: vendored` (frontmatter + registry entry) and are exempt from the `olko-` prefix.

## Serving

Split `registry.json` into per-category `index.json` files (or expose one URL per category in `skills.urls`) before serving.
