---
name: olko-react-style
description: "Check React/TypeScript style compliance for changed files with marketplace defaults. Reads project docs and adapters, maps .ts/.tsx files to Vite project roots, runs documented format/lint commands such as ESLint/Prettier when configured, checks common React style expectations that docs enable (naming, formatting, imports, component patterns, hooks rules, CSS Modules, React Query, React Hook Form, typed API client), and reports violations with rule sources. Use when validating React style, linting React/TypeScript changes, before commit/test gates, or when olko-commit-style delegates React style checks."
---

# Olko React Style

## What I do
- Map changed `.ts` / `.tsx` files to their nearest Vite/React project root.
- Read style rules from `.agents/skill-config.md`, `.agents/skills/olko-react-style/project.md`, scoped `AGENTS.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Run the documented React style command.
- Inspect changed files against documented style rules that tools cannot enforce.
- Report violations with file, line, broken rule, and rule source.

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

## Default React style rules

Apply these defaults unless config, adapter, or project docs override them.

### Language and target
- Write all component/JSX files as `.tsx`; write non-JSX logic (hooks, utils, API clients, types) as `.ts`.
- Keep `strict` mode enabled in `tsconfig.json`.

### Naming
- Component directory and file names: PascalCase matching the component (`UserCard/UserCard.tsx`).
- Hook file and function names: camelCase prefixed with `use` (`useUserQuery.ts`).
- CSS Module class names: camelCase (`styles.cardHeader`), so they work as plain JS property access.
- Non-component modules (utils, API clients, types): camelCase file names (`userClient.ts`, `formatDate.ts`).
- Constants: UPPER_SNAKE_CASE for module-level constants.

### Formatting
- Use the project's configured Prettier settings (2-space indentation, semicolons, single or double quotes as configured) — do not hand-format against it.
- Trailing commas in multi-line literals when Prettier/ESLint configures them.
- Prefer arrow-function components with an explicit `Props` type/interface over `React.FC`.

### Imports
- Group imports: external packages first, then internal aliases (`@/...`), then relative imports, with the component's own `.module.css` import last.
- No default React import required with the automatic JSX runtime (React 17+/Vite default) unless the project docs say otherwise.
- Use path aliases from `tsconfig.json`/`vite.config.ts` instead of long relative `../../../` chains.

### Component patterns
- Function components only; no class components for new code.
- Type props with an explicit `interface Props` or `type Props` — do not use `PropTypes`.
- One component per file/directory; extract sub-components to their own directory when they grow reusable.
- Prefer composition (children, render props, compound components) over deeply nested boolean props.

### Hooks rules
- Follow the Rules of Hooks (`eslint-plugin-react-hooks`): hooks only at the top level, only in components/custom hooks.
- Keep `useEffect` dependency arrays exhaustive (`exhaustive-deps`); do not silence the lint rule without a documented reason.
- Custom hooks are named `useX` and return either a single value, a tuple, or a small typed object — not an ad-hoc positional array beyond 2 items.

### CSS Modules
- Import as `import styles from './ComponentName.module.css'` and reference via `styles.className`.
- Use `composes:` for shared style fragments instead of duplicating declarations.
- No `!important`; no bare global element selectors inside a module file.
- Keep the module colocated with its component; do not centralize component-specific styles in a shared stylesheet.

### React Query style
- Wrap `useQuery`/`useMutation` in a domain hook (`useUserQuery`, `useUpdateUserMutation`); do not call `useQuery` directly from a component with an inline fetcher.
- Build query keys from a per-domain key factory; do not inline raw array literals per call site.
- Invalidate via `queryClient.invalidateQueries({ queryKey: ... })` using the same key factory, not a manual refetch of unrelated state.
- Do not duplicate React Query's cache in local component state.

### React Hook Form style
- Use `useForm` with a schema resolver (`zodResolver`/`yupResolver`) for schema-shaped forms; use `register` for plain inputs and `Controller` only for controlled third-party inputs.
- Display field errors from `formState.errors` inline next to the field; do not manage a parallel error `useState`.
- Submit through a mutation hook from the API layer; the submit handler stays a thin adapter.

### API client style
- One typed client module per external service under `reactApiDir`; export a typed instance, not a bag of loose functions with duplicated base-URL logic.
- Centralize headers/auth/timeouts in the client's request wrapper.
- Client methods throw a typed error on failure — never swallow and return `undefined`/`null` silently.

### Functions and types
- Keep functions short and focused on one responsibility.
- Prefer explicit return types on exported functions/hooks; allow inference for short local helpers.
- Keep log output structured and consistent with the surrounding codebase.

### Generated code
- Do not edit generated code (generated OpenAPI/GraphQL types, `dist/` outputs) by hand.
- Keep generated sources excluded from manual formatting and lint cleanup.
- Regenerate through the documented generator task, not by hand.

### File creation
- Create parent directories before writing generated artifacts.
- Always specify text encoding explicitly for non-UTF-8-default tooling.
- Handle write failures gracefully — do not let a failed write silently corrupt state.

### When to create a new component
- Encapsulate a cohesive piece of UI and its local state together.
- Multiple independent usages are needed, or the JSX would otherwise be duplicated.
- Customizing via composition (children/props) is required.

### When to split to a new file
- File exceeds ~300-400 lines.
- Different concerns (presentation vs. data-fetching vs. formatting utilities).
- One exported component or cohesive hook group per file.

### Single responsibility
- Component: renders one cohesive piece of UI.
- Hook: owns one piece of stateful logic or one data dependency.
- Module: one domain concept per file.
- Keep API access, form logic, and presentation separate.

### Silent failures — zero tolerance
- Never return `null`/`undefined` or silently skip rendering when required data/config is missing without a visible error/fallback state.
- Never swallow a caught error and return a default result without logging or surfacing it (React Query's `error` state, a toast, or a thrown typed error).
- If required `import.meta.env` config is missing, fail fast with a clear error naming the expected key.

### Comments
- Do not write comments. Code should be self-documenting through clear naming.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.ts` / `.tsx` files. Skip generated files only when docs say they are not manually edited.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-react-style/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map project roots
For every changed file:
- find the nearest `package.json` beside a `vite.config.ts`/`.js`, unless `reactProjectRoot` overrides it
- group files by project root
- identify the working directory from config, adapter, or docs

### Step 4 - Run style command
Run `reactStyleCommand` when configured.

If no config command exists, use the command documented in `AGENTS.md` / `CODING_STYLE.md`.

If docs name a tool but not a command, infer the narrow verify command only for standard project-local tools already configured in `package.json`:
- `npm run lint` / `npx eslint .`
- `npx prettier --check .`

Do not install tools, add plugins, or change config.

### Step 5 - Inspect documented style rules
Check rules found in docs/adapters/config plus marketplace defaults when docs do not override them. Common rule types to look for:
- naming conventions (component directories/files, hooks, CSS Module classes)
- component patterns (class components, missing `Props` type, `React.FC` usage where docs disallow it)
- hooks-rules violations and non-exhaustive `useEffect` dependencies
- CSS Modules misuse (global selectors, `!important`, centralized component styles)
- React Query direct `useQuery` calls bypassing domain hooks, inline query keys
- React Hook Form fields shadowed by parallel `useState`
- API client logic scattered outside `reactApiDir`
- silent failures and fail-fast behavior for missing config/resources
- generated-code edit restrictions
- comments (code should be self-documenting)

### Step 6 - Handle violations
If violations exist and `reactStyleFixCommand` is configured or documented, ask before running it unless the parent workflow already authorized auto-fix.

If reporting:

```text
React style violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No React style violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard React/TypeScript style conventions per project.
- Never hardcode project-specific commands, paths, or style rules.
- Prefer documented project rules over generic React opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
