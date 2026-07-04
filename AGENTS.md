# Marketplace

Catalog of opencode skills, optimized for opencode, served via `registry.json`.

## Skill naming convention

See [`docs/naming.md`](docs/naming.md).

## Registry format

`registry.json` extends the opencode Index shape (`{ skills: [{ name, files, version? }] }`) with a `category` field matching the `skills/<category>/` folder. Only list skills whose `SKILL.md` has valid frontmatter (`name` + `description`); exclude empty stubs.

## Serving

opencode discovery fetches `<base>/index.json` and files from `<base>/<name>/<file>`. Split `registry.json` into per-category `index.json` files (or expose one URL per category in `skills.urls`) before serving.
