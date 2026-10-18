# Olko React Testing Overview

Check React test conventions for changed `.ts` / `.tsx` files in TypeScript/React projects, with marketplace defaults.

## What I do
- Map changed `.ts` / `.tsx` source files to related Vitest test files (colocated `*.test.ts(x)` or `__tests__/`).
- Read test rules from `.agents/skill-config.md`, `.agents/skills/olko-react-testing/project.md`, scoped `AGENTS.md`, `TESTING.md`, and `CODING_STYLE.md`.
- Check marketplace default React test conventions unless project docs override them.
- Report violations with file, line, broken rule, and rule source.

## When to use
Use when validating React tests, before commit/test gates, or when `olko-test` or `olko-commit-style` delegates React test-convention checks.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `reactTestCommand` | `vitest run` | Command to run unit/component tests. |
| `reactProjectRoot` | nearest `package.json` beside `vite.config.ts`/`.js` | Override the Vite/React project root. |
| `reactTestTimeoutMs` | `120000` | Explicit timeout for `reactTestCommand`. |
| `readTestingDocs` | `true` | Whether to read test docs. |
| `reactTestingDocs` | `TESTING.md` | Additional test convention docs to read when present. |
| `reactDevCommand` | `npm run dev` | Command that starts the Vite dev server, used for manual e2e verification. |
| `reactE2ETool` | `agent-browser` | Vercel Labs browser-automation CLI used for manual e2e verification on the dev machine. |
