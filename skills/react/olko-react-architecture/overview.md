# Olko React Architecture Overview

Check React architecture compliance for changed `.ts` / `.tsx` files in TypeScript/React projects, with marketplace defaults.

## What I do
- Map changed `.ts` / `.tsx` files to their nearest Vite/React project root (`package.json` next to a `vite.config.ts`).
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-react-architecture/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Inspect imports, directory boundaries, data-fetching ownership, and dependency direction against documented rules.
- Run configured architecture/import checks when present.
- Report violations with file, line, broken rule, and rule source.

## When to use
Use when validating React architecture, before commit/test gates, during plan review, or when `olko-commit-style`, `olko-test`, or `olko-plan-editor` delegates React architecture checks.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `reactArchitectureCommand` | — | Command to run React architecture checks. |
| `reactProjectRoot` | nearest `package.json` beside `vite.config.ts`/`.js` | Override the Vite/React project root. |
| `reactSourceRoot` | `src/` | Source root relative to the project root. |
| `reactPagesDir` | `src/pages` | Route-level page components. |
| `reactComponentsDir` | `src/components` | Reusable component directory. |
| `reactApiDir` | `src/api` | Typed fetch-based API client layer. |
| `reactQueriesDir` | colocated `*.queries.ts` next to `reactApiDir`, or `src/queries` | React Query hook layer. |
| `reactGeneratedCodeDirs` | `dist/`, generated API types | Directories excluded from manual-edit and boundary checks. |
| `readArchitectureDocs` | `true` | Whether to read architecture docs. |
