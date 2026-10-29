---
name: olko-react-native-architecture
version: 1.1.0
description: "Review React Native application architecture across TypeScript and native platform boundaries, including monorepo workspaces. Check package ownership, dependency resolution, Metro, autolinking, app boundaries, navigation, API/auth, persistence, security, and Expo or bare React Native integration. Use when designing or reviewing React Native architecture."
---

# React Native Architecture

Review changed React Native code against project rules and these mobile defaults. Report actionable findings with file, line, violated rule, and source. Do not modify code unless asked.

## Adaptation and configuration

Resolve rules in this order:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace defaults
```

Read `.agents/skill-config.md` and applicable `AGENTS.md` files. Unless `projectAdapter: false`, also read `.agents/skills/olko-react-native-architecture/project.md` when present. Apply defaults only where higher-priority guidance is silent. Infer undocumented conventions only when `conventionDiscovery` is enabled or the user asks.

Recognized configuration keys:

| Key | Default | Purpose |
|---|---|---|
| `reactNativeArchitectureCommand` | none | Optional architecture/import check command. |
| `reactNativeProjectRoot` | nearest app manifest (`package.json` or `app.json`) | Override the app root. |
| `reactNativeWorkspaceRoot` | nearest workspace root, only when convention discovery is enabled | Override the package-manager workspace root. |
| `reactNativeSharedPackageRoots` | configured roots; otherwise discover from workspace manifests only when enabled | Shared package roots consumed by the app. |
| `reactNativeSourceRoot` | `src/` when present; otherwise app root | Override source root. |
| `reactNativeArchitectureDocs` | `ARCHITECTURE.md` | Additional architecture guidance to read when present. |
| `reactNativeGeneratedCodeDirs` | generated native/codegen and build output documented by the project | Exclude generated files from manual checks. |
| `reactNativeFramework` | discover only when `conventionDiscovery: true`; otherwise unspecified | Project fact: Expo or bare React Native. |
| `readArchitectureDocs` | `true` | Read architecture docs. |
| `conventionDiscovery` | `false` | Permit repository convention discovery. |
| `projectAdapter` | `true` | Load the project adapter. |

## Marketplace defaults

- Use the React Native ecosystem's component-and-hook model. Keep screen components focused on composition and interaction; extract reusable behavior into focused hooks and feature modules. Do not impose a ViewModel class or repository layer by analogy with another platform.
- Separate server state from transient UI state. Use the project's query/cache solution for server state where one exists; avoid duplicate sources of truth and ad hoc global stores.
- Organize by feature where useful. Keep navigation declarations and route parameter types centralized enough to prevent route drift. Support cold-start and already-running deep links through the chosen navigation library.
- Centralize API base URL, serialization, authentication, refresh behavior, timeout/error mapping, and tracing. Screens must not build authenticated requests or embed endpoint configuration.
- Store access tokens and other secrets only in platform-backed secure storage. Use ordinary preferences/AsyncStorage only for non-sensitive data. Enforce HTTPS outside explicitly documented local development.
- Keep platform-specific behavior behind a small platform boundary (`.ios`/`.android` modules, native modules, or adapters); do not duplicate feature logic by platform without a need.
- Treat Expo managed/prebuild and bare React Native as distinct build environments. Use the configured framework and documented native module workflow; do not assume direct native project edits survive generation.
- In a monorepo, resolve the repository/workspace root separately from each React Native app root. Read the root workspace manifest and the app/package manifests to establish ownership, package manager, workspace globs, scripts, and dependency boundaries.
- Shared workspace packages must declare their dependencies and platform support. Keep app-only code out of shared packages; keep shared UI/business packages free of app internals and unsupported Node/browser APIs. Use platform-specific files or explicit platform adapters only when required.
- Check that each app declares the React/React Native/native module dependencies it uses, rather than relying on accidental hoisting. Detect duplicate React or React Native copies and duplicate native modules that can conflict during native linking/builds.
- Review Metro and native autolinking as one resolution path. Preserve the framework's current default config (`@react-native/metro-config` or `@expo/metro-config`) and only add workspace-specific overrides when the installed framework/version requires them; do not cargo-cult older `watchFolders` or `nodeModulesPath` recipes.
- Check that codegen, native autolinking, Android Gradle, CocoaPods, and build scripts resolve workspace packages from the intended app/workspace root. For Expo/EAS, keep app-specific build config in each app and run commands from the documented app root.
- Keep shared workspace packages independently type-checkable/testable where their package contract requires it, while ensuring each runnable app can build without importing another app's source tree.
- Validate API input at boundaries and map transport DTOs to presentation/domain types when it prevents coupling. Do not trust client checks as server security.
- Keep generated code out of hand edits. Check dependency direction, native module ownership, permissions, and app configuration changes when reviewing native-facing files.

## Workflow

1. Resolve changed files from the caller; otherwise inspect the working tree and diff. Include relevant `.ts`, `.tsx`, app config, workspace manifests, Metro config, Android, iOS, and native-module files; exclude generated output.
2. Load adaptation sources and resolve app root and workspace root from configuration. Inspect manifests to discover them only when convention discovery is enabled or the user requests repository analysis.
3. Map changed files to their owning app or shared package. Trace imports from the app through shared packages and identify package-manager/workspace boundaries.
4. Trace one affected feature from route to component/hook, API boundary, and persistence/auth where relevant. Inspect Metro, autolinking, codegen, and native build paths when packages cross into native code.
5. Run `reactNativeArchitectureCommand` only when configured. Do not invent a repository-specific command.
6. Report each issue with a source. If clean, say no React Native architecture violations were found.

## Rules

- Prefer documented project rules over generic defaults and identify conflicts rather than silently overriding them.
- Do not hardcode project paths, package names, framework versions, commands, or API endpoints in this skill.
- Do not load other skills automatically.
