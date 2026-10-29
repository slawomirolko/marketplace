---
name: olko-react-security
description: "Check React/TypeScript front-end security compliance for changed files with marketplace defaults. Read-only. Reads project docs and adapters, maps changed .ts/.tsx/app-shell/package files to Vite project roots, verifies bundle secrets, HTML sanitization, token storage, URL and redirect safety, postMessage origins, DOM and code-execution sinks, CSRF, auth-header scope, app-shell CSP and security headers, third-party scripts, service-worker caching, and supply chain, and reports violations with rule ids and sources. Use when validating React security, before commit/test gates, during plan review, or when olko-react-architecture/olko-commit-style/olko-test/olko-plan-editor delegates React security checks."
---

# olko-react-security

## Routing Summary
Check React/TypeScript front-end security compliance for changed files with marketplace defaults. Read-only. Maps changed `.ts`/`.tsx` files, the app shell (`index.html`, Vite config, service worker, hosting header config), and package manifests to Vite project roots, checks them against the rule catalogue, and reports each violation with a rule id and a rule source. Use when validating React security, before commit/test gates, during plan review, or when `olko-react-architecture`, `olko-commit-style`, `olko-test`, or `olko-plan-editor` delegates React security checks.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `references/rules.md` when the check starts.
- Load `examples.md` only when the report shape is needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what this skill checks, when to use it, rule groups, and configuration keys.
- `workflow.md` - ordered check workflow and report format.
- `references/rules.md` - rule catalogue: boundaries `B1`-`B4`, tokens and auth `T1`-`T4`, URLs and messaging `U1`-`U3`, DOM and code execution `D1`-`D4`, app shell `H1`-`H4`, supply chain `P1`.
- `examples.md` - report output shape.
- `edge-cases.md` - strict rules and failure handling.
