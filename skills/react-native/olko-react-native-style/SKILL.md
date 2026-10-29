---
name: olko-react-native-style
version: 1.1.0
description: "Check style and static-quality conventions in React Native TypeScript and native-facing code. Read project rules, run configured ESLint/Prettier/type checks, and inspect hooks, components, platform boundaries, accessibility, and mobile performance patterns. Use when reviewing or formatting React Native changes."
---

# React Native Style

Check changed React Native files against project rules and these defaults. Run only documented/configured commands. Report actionable findings with file, line, rule, and source. Apply fixes only when asked or when the parent workflow authorizes them.

## Adaptation and configuration

Resolve rules in this order:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace defaults
```

Read `.agents/skill-config.md`, applicable `AGENTS.md` and `CODING_STYLE.md` files. Unless `projectAdapter: false`, also read `.agents/skills/olko-react-native-style/project.md` when present. Infer undocumented conventions only when `conventionDiscovery` is enabled or the user asks.

Recognized configuration keys:

| Key | Default | Purpose |
|---|---|---|
| `reactNativeStyleCommand` | none | Configured lint/style command. |
| `reactNativeFormatCommand` | none | Configured formatter command. |
| `reactNativeTypecheckCommand` | none | Configured TypeScript check command. |
| `reactNativeProjectRoot` | nearest app manifest (`package.json` or `app.json`) | Override app root. |
| `reactNativeWorkspaceRoot` | nearest workspace root, only when convention discovery is enabled | Override workspace root for package-manager commands. |
| `reactNativeGeneratedCodeGlobs` | generated code and build output documented by the project | Exclude generated files. |
| `reactNativeStyleDocs` | `CODING_STYLE.md` | Additional style docs to read when present. |
| `readArchitectureDocs` | `true` | Read architecture docs that constrain style. |
| `conventionDiscovery` | `false` | Permit repository convention discovery. |
| `projectAdapter` | `true` | Load the project adapter. |

## Marketplace defaults

- Use TypeScript for application code when the project supports it; keep strict compiler options enabled and avoid `any` at API, navigation, and component boundaries. Narrow `unknown` through validation.
- Follow the configured formatter and linter. Keep imports, naming, file layout, and component conventions consistent with the codebase; do not impose web-only CSS Modules or browser APIs on native code.
- Use function components and hooks. Follow the Rules of Hooks; keep effects for synchronization with external systems, with correct dependencies and cleanup. Derive values during render instead of storing duplicate state.
- Keep components focused. Extract repeated behavior into a hook or feature module when that improves reuse or testing; avoid abstraction for one-off trivial code.
- Type navigation route parameters and API request/response boundaries. Avoid unsafe casts that hide invalid route or server data.
- Provide accessible labels, roles, and state for interactive controls. Respect platform conventions, touch target needs, text scaling, and reduced-motion behavior when applicable.
- Use `FlatList`/`SectionList` or the project's virtualized list for large collections; provide stable keys and avoid eager rendering of unbounded data. Optimize based on measured bottlenecks, not blanket memoization.
- Keep expensive work and noisy logging off interactive render paths. Add callbacks or memoization only to prevent measured or evident repeated work.
- Use shared design tokens/theme and `StyleSheet` or the project's native styling system. Keep platform-specific styles explicit and small.
- Do not log credentials, tokens, personal data, or sensitive request bodies. Never put secrets in app config that ships to clients.
- Do not hand-edit generated native/codegen files or lockfiles outside the package manager's documented workflow.

## Workflow

1. Resolve changed files from the caller; otherwise inspect working tree and diff. Include `.ts`, `.tsx`, app/workspace manifests, Metro config, and native files in scope; skip generated output.
2. Load adaptation sources and determine applicable commands from config, adapter, or docs.
3. Run each configured formatter/linter/type-check command from its documented root. Do not guess commands or auto-fix unless authorized by the user/workflow.
4. Inspect changed lines for mobile-specific style concerns that tools miss: hook correctness, accessibility, typed boundaries, list behavior, sensitive logging, and platform conditionals.
5. In workspace packages, check declared dependencies, public exports/types, platform compatibility, and that style/type rules do not depend on accidental root hoisting. Run checks from the configured package/app/workspace root.
6. Report violations with source. If clean, say no React Native style violations were found.

## Rules

- Documented project rules override marketplace defaults.
- Keep project-specific commands, naming rules, and framework choices in config, adapters, or `AGENTS.md`.
- Do not load other skills automatically.
