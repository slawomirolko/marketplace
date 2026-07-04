# Marketplace

Catalog of opencode skills served via `registry.json`.

## Skill naming convention

See [`docs/naming.md`](docs/naming.md).

## Registry format

`registry.json` follows the opencode Index shape (`{ skills: [{ name, files, version? }] }`) extended with a `category` field matching the `skills/<category>/` folder. Only list skills whose `SKILL.md` has valid frontmatter (`name` + `description`); empty stubs are excluded.

## Serving

opencode discovery fetches `<base>/index.json` and files from `<base>/<name>/<file>`. Split `registry.json` into per-category `index.json` files (or expose one URL per category in `skills.urls`) before serving.
