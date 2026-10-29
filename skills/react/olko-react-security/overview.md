# Olko React Security Overview

Check front-end security compliance for changed files in TypeScript/React projects, with marketplace defaults. This skill is read-only. It reports violations. It does not fix code.

## What I do
- Map changed files to their nearest Vite/React project root (`package.json` next to a `vite.config.ts`).
- Read security rules from `.agents/skill-config.md`, `.agents/skills/olko-react-security/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `CODING_STYLE.md`.
- Check changed lines against the rule catalogue in `references/rules.md` and against documented project security rules.
- Run a configured security command when one exists.
- Report every violation with rule id, file, line, broken rule, and rule source.

## When to use
Use when validating React security, before commit/test gates, during plan review, or when `olko-react-architecture`, `olko-commit-style`, `olko-test`, or `olko-plan-editor` delegates React security checks. Apply it to the same scope as `olko-react-architecture`.

## Rule groups

| Group | Ids | Typical files |
|-------|-----|---------------|
| Boundaries | `B1`-`B4` | `.ts`, `.tsx` |
| Tokens and auth | `T1`-`T4` | API client, auth hooks, route guards |
| URLs and messaging | `U1`-`U3` | links, navigation, redirects, `postMessage` |
| DOM and code execution | `D1`-`D4` | components, refs, renderers, file previews |
| App shell | `H1`-`H4` | `index.html`, Vite config, hosting header config, service worker |
| Supply chain | `P1` | `package.json`, lockfile, package-manager config |

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Load `.agents/skills/olko-react-security/project.md`. |
| `reactSecurityCommand` | — | Optional command that runs security checks (for example a dependency audit). |
| `reactSecurityRulesDisabled` | `[]` | Rule ids to skip, for example `[H4, P1]`. |
| `reactProjectRoot` | nearest `package.json` beside `vite.config.ts`/`.js` | Override the Vite/React project root. |
| `reactHeadersConfig` | — | File that sets HTTP response headers for the app shell (hosting config, reverse-proxy config, or server middleware). |
| `reactHtmlSanitizer` | — | The documented sanitizer used for `B2` and `D3`. |
| `reactGeneratedCodeDirs` | `dist/`, generated API types | Directories excluded from checks. |
| `readArchitectureDocs` | `true` | Whether architecture and security docs may add or override rules. |

With no config and no adapter, all rules apply with the defaults above. Project-specific rule changes belong in `.agents/skill-config.md`, the project adapter, or `AGENTS.md`.

## Related skills
- `olko-react-architecture` owns layout, data-layer, and API client ownership. This skill owns the security rules.
- Back-end enforcement (authorization, CSRF validation, CORS) belongs to the back-end stack's security skill, for example `olko-dotnet-security`.
