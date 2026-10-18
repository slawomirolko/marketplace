---
name: olko-react-style
description: "Check React/TypeScript style compliance for changed files with marketplace defaults. Reads project docs and adapters, maps .ts/.tsx files to Vite project roots, runs documented format/lint commands such as ESLint/Prettier when configured, checks common React style expectations that docs enable (naming, formatting, imports, component patterns, hooks rules, CSS Modules, React Query, React Hook Form, typed API client), and reports violations with rule sources. Use when validating React style, linting React/TypeScript changes, before commit/test gates, or when olko-commit-style delegates React style checks."
---

# olko-react-style

## Routing Summary
Check React/TypeScript style compliance for changed files with marketplace defaults. Reads project docs and adapters, maps `.ts`/`.tsx` files to Vite project roots, runs documented format/lint commands such as ESLint/Prettier when configured, checks common React style expectations that docs enable (naming, formatting, imports, component patterns, hooks rules, CSS Modules, React Query, React Hook Form, typed API client), and reports violations with rule sources. Use when validating React style, linting React/TypeScript changes, before commit/test gates, or when olko-commit-style delegates React style checks.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what this skill checks, when to use it, its configuration keys, and its marketplace defaults.
- `workflow.md` - the ordered check workflow and the default React style rule catalog.
- `examples.md` - report output shape.
- `edge-cases.md` - strict rules and failure handling.
