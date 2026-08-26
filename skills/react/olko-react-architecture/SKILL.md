---
name: olko-react-architecture
description: "Check React architecture compliance for changed TypeScript/React projects with marketplace defaults. Reads project docs and adapters, maps changed .ts/.tsx files to the nearest package.json/Vite project root, verifies component/pages source layout, module boundaries, dependency direction, React Query data-layer separation, typed fetch-based API client ownership, React Hook Form boundaries, CSS Modules styling boundaries, TypeScript strictness, and security boundaries, and reports violations with rule sources. Use when validating React architecture, before commit/test gates, during plan review, or when olko-commit-style/olko-test/olko-plan-editor delegates React architecture checks."
---

# Olko React Architecture

## What I do
- Map changed `.ts` / `.tsx` files to their nearest Vite/React project root (`package.json` next to a `vite.config.ts`).
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-react-architecture/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Inspect imports, directory boundaries, data-fetching ownership, and dependency direction against documented rules.
- Run configured architecture/import checks when present.
- Report violations with file, line, broken rule, and rule source.

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

## Default React architecture rules

Apply these defaults unless config, adapter, or project docs override them.

### Layout
- Keep application code under `src/`, split into `components/`, `pages/`, `hooks/`, `api/`, `types/`, and a shared `lib/` (or `utils/`) directory.
- Each component lives in its own directory: `ComponentName/ComponentName.tsx`, `ComponentName.module.css`, `ComponentName.test.tsx`, `index.ts` re-exporting the public surface.
- `pages/` holds route-level components only; a page composes components, it does not define reusable UI.
- Keep generated code (`dist/`, generated OpenAPI/GraphQL types) under generated directories; do not hand-edit it.
- Do not duplicate shared contract/type definitions across features; keep one source of truth per type.

### Architecture pattern
- Pages own routing/composition; components own presentation; hooks own reusable stateful logic; the API layer owns transport.
- Keep server state in React Query (`useQuery` / `useMutation` behind a custom `useXQuery` / `useXMutation` hook) — do not duplicate server state in local `useState` + `useEffect` fetch code.
- Keep client-only UI state (open/closed, selected tab, form-transient state not owned by React Hook Form) in local `useState`/`useReducer`, or a documented client-state store when the project has one.
- Do not make direct `fetch`/API calls from components or pages — route them through a query hook that wraps the typed API client.
- Compose pages from components; do not put business/data logic inline in a page component beyond wiring hooks to components.

### Data fetching (React Query)
- Keep one `QueryClient` instance created at the app root; do not create ad-hoc `QueryClient`s inside components.
- Group query keys with a query-key factory per domain (e.g. `userKeys.detail(id)`); do not inline raw array literals at each call site.
- Keep query/mutation hooks in `reactQueriesDir` (or colocated with their domain under `api/`), one hook module per domain/resource.
- Do not fetch in `useEffect` when a React Query hook already covers that data.

### Forms (React Hook Form)
- Use `react-hook-form` for form state; do not shadow field values in parallel `useState`.
- Validate with a schema resolver (e.g. zod/yup via `@hookform/resolvers`); keep the schema colocated with the form or in a shared `schemas/` module — do not hand-roll ad-hoc validation branches for schema-shaped forms.
- Submit handlers call the typed API client through a mutation hook; do not call `fetch` directly inside `onSubmit`.

### Styling (CSS Modules)
- Style components with colocated CSS Modules (`ComponentName.module.css`); import as `styles` and reference `styles.className`.
- Do not use global stylesheets for component-scoped styles; global CSS is limited to resets, tokens/variables, and app-shell layout.
- Do not inline styles for anything reusable or themeable; inline `style=` is reserved for computed, per-instance values (e.g. a measured width).

### API client and external-service configuration
- Keep one typed fetch-based client per external service under `reactApiDir` (e.g. `api/userClient.ts`); do not construct ad-hoc `fetch` calls scattered across hooks/components.
- Centralize base URL, headers, and auth-token injection in the client's request wrapper; do not scatter auth headers across call sites.
- Client methods return typed, parsed responses (or throw a typed error) — never an unparsed `Response`.
- Do not catch fetch/network errors silently inside the client; let React Query's error state (or a thrown typed error) reach the UI.
- Read base URLs and public config only from `import.meta.env.VITE_*`; do not hardcode connection details in business logic.

### TypeScript
- Keep `strict` mode enabled in `tsconfig.json`; do not weaken it per-file with `// @ts-nocheck` outside generated code.
- Avoid `any`; prefer `unknown` with narrowing, or a precise type/interface.
- Keep path aliases in `tsconfig.json` `paths` in sync with `vite.config.ts` `resolve.alias` — an alias defined in one and missing from the other is a violation.

### Security boundaries
- Never embed secrets (API keys, tokens) in client bundle code; only `VITE_`-prefixed public config belongs in `import.meta.env`.
- Validate/sanitize any user-controlled content rendered as HTML; do not use `dangerouslySetInnerHTML` without a documented sanitizer.
- Do not trust client-side form validation alone — the API layer surfaces server validation errors, it does not suppress them.

### Observability and logging
- Route logging through a documented logger or a thin wrapper; do not scatter raw `console.log` in business logic.
- Never log sensitive data (tokens, credentials, PII).

### Module organization
- Keep the API/transport layer in `reactApiDir`.
- Keep route-level composition in `reactPagesDir`.
- Keep reusable presentation in `reactComponentsDir`; keep reusable stateful logic in `hooks/`.
- Consume environment/config from the app boundary (`import.meta.env`); do not reimplement config resolution inside components or hooks.

### Maintenance
- Regenerate generated code (OpenAPI/GraphQL types) through the documented generator task, not by hand.
- See the project's architecture docs for connection and endpoint setup.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.ts` / `.tsx` files. Skip generated files when docs identify them as generated and outside manual-edit scope. Skip `dist/`, `node_modules/`, and build output.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-react-architecture/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map project roots
For every changed file:
- find the nearest `package.json` beside a `vite.config.ts`/`.js`, unless `reactProjectRoot` overrides it
- identify `reactPagesDir`, `reactComponentsDir`, `reactApiDir`, `reactQueriesDir` from config, adapter, or established repo layout
- identify generated-code directories only from docs/config or established repo layout

### Step 4 - Inspect architecture
Check documented rules plus marketplace defaults when docs do not override them. Common rule types to look for:
- import direction between `pages` → `components`/`hooks`/`api` (never the reverse)
- direct `fetch`/API calls in components or pages instead of a query hook
- server state duplicated in local `useState`/`useEffect`
- ad-hoc `QueryClient` instances, inline query keys instead of a key factory
- form fields shadowed in parallel `useState` alongside React Hook Form
- global CSS used for component-scoped styling
- scattered fetch/auth-header construction outside the typed API client
- `any` usage, `strict` mode disabled, or alias drift between `tsconfig.json` and `vite.config.ts`
- secrets embedded outside `VITE_`-prefixed public config
- generated file ownership violations

Use TypeScript import inspection where practical. Avoid brittle text-only checks.

### Step 5 - Run architecture command when configured
If `reactArchitectureCommand` exists, run it from the project root or documented working directory.

If no command exists, do not invent one. Continue with document-based inspection.

### Step 6 - Report result
If violations exist:

```text
React architecture violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If command checks fail, include the failing command and the smallest useful error snippet.

If clean:

```text
No React architecture violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard React/Vite architecture conventions per project.
- Never hardcode project-specific package names, commands, or paths.
- Prefer documented project rules over generic React opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
