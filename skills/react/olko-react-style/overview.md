# Olko React Style Overview

Check React/TypeScript style compliance for changed `.ts` / `.tsx` files with marketplace defaults.

## What I do
- Map changed `.ts` / `.tsx` files to their nearest Vite/React project root.
- Read style rules from `.agents/skill-config.md`, `.agents/skills/olko-react-style/project.md`, scoped `AGENTS.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Run the documented React style command.
- Inspect changed files against documented style rules that tools cannot enforce.
- Report violations with file, line, broken rule, and rule source.

## When to use
Use when validating React style, linting React/TypeScript changes, before commit/test gates, or when `olko-commit-style` delegates React style checks.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `reactStyleCommand` | — | Command to verify React/TypeScript style. |
| `reactStyleFixCommand` | — | Command to auto-fix React/TypeScript style. |
| `reactProjectRoot` | nearest `package.json` beside `vite.config.ts`/`.js` | Override the Vite/React project root. |
| `reactStyleGeneratedGlobs` | `**/dist/**`, `**/node_modules/**`, generated API types | Files skipped unless docs say otherwise. |
| `readArchitectureDocs` | `true` | Whether architecture docs may add style constraints. |
| `readTestingDocs` | `true` | Whether test docs may add test style constraints. |

## Marketplace defaults

Use these defaults only when config, adapter, or project docs do not override them:

```yaml
reactStyleGeneratedGlobs:
  - "**/dist/**"
  - "**/node_modules/**"
readArchitectureDocs: true
readTestingDocs: true
```

These are reusable marketplace defaults. Project-specific naming rules, layer names, and custom commands belong in `.agents/skill-config.md`, `.agents/skills/olko-react-style/project.md`, or `AGENTS.md`.
