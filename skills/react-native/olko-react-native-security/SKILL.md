---
name: olko-react-native-security
version: 1.0.0
description: "Review React Native mobile apps for security issues across JavaScript, native Android/iOS configuration, storage, authentication, networking, deep links, WebViews, logs, dependencies, and release builds. Use for focused security reviews or when changing sensitive mobile flows; follow project rules and report evidence with severity."
---

# React Native Security

Review the changed mobile behavior and its surrounding trust boundaries. Focus on practical risks in the app and native configuration, not generic checklist completion. Report each finding with file/line, impact, evidence, and a concrete fix. Do not change code unless asked or authorized by the parent workflow.

## Adaptation and configuration

Resolve rules in this order:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace defaults
```

Read `.agents/skill-config.md`, applicable `AGENTS.md` files, and relevant security guidance. Unless `projectAdapter: false`, also read `.agents/skills/olko-react-native-security/project.md` when present. Apply project threat models and release constraints before defaults. Infer undocumented conventions only when `conventionDiscovery` is enabled or the user asks.

Recognized configuration keys:

| Key | Default | Purpose |
|---|---|---|
| `reactNativeSecurityCommand` | none | Optional configured security/static-analysis command. |
| `reactNativeProjectRoot` | nearest app manifest (`package.json` or `app.json`) | Override app root. |
| `reactNativeWorkspaceRoot` | nearest workspace root, only when convention discovery is enabled | Override package-manager workspace root. |
| `reactNativeSecurityDocs` | security guidance documented by the project | Additional project security policy paths. |
| `reactNativeThreatModel` | project-defined; otherwise assess account/data sensitivity and attacker access to the device/app bundle | Project security assumptions and risk tolerance. |
| `reactNativeFramework` | discover only when `conventionDiscovery: true`; otherwise unspecified | Expo or bare React Native. |
| `conventionDiscovery` | `false` | Permit repository convention discovery. |
| `projectAdapter` | `true` | Load the project adapter. |

## Marketplace security defaults

### Secrets and persisted data

- Treat every value shipped in a mobile bundle, JavaScript bundle, app config, native resource, or source map as extractable. Do not embed private API keys, service credentials, signing secrets, or privileged tokens. Public client identifiers are not secrets.
- Store credentials in platform-backed secure storage (Keychain on iOS or Keystore-backed storage on Android, through a maintained RN module). Never persist credentials in AsyncStorage, ordinary preferences, Redux persistence, or an unencrypted database. Use ordinary local storage only for data whose exposure after device compromise is acceptable; minimize sensitive data and define logout/account-switch cleanup.
- Keep secrets out of logs, analytics, crash reports, navigation params, clipboard, notifications, screenshots, and debug tooling. Scrub request/response bodies and user identifiers where possible.

### Authentication, authorization, and networking

- Use platform browser-based OAuth/OIDC authorization with PKCE for native public clients. Do not embed a client secret in a mobile app. Validate redirect URI/scheme ownership and state/nonce where the auth library requires it.
- Keep access-token attachment, refresh, expiry, logout, and concurrent 401 handling centralized. Do not put tokens in URLs. Clear credentials and user-scoped caches on logout or account change.
- Require HTTPS for production endpoints. Do not disable certificate validation or allow broad cleartext traffic in release builds. Keep local HTTP exceptions narrow and debug-only.
- Treat TLS certificate pinning as a threat-model decision, not a universal default. If used, verify backup/rotation strategy and failure recovery so certificate changes do not permanently lock users out.
- Enforce authorization and validation on the server. Hiding UI or checking permissions only in the app is not an access-control boundary.
- Do not trust deep-link parameters, push payloads, local storage, clipboard content, or API responses until validated. Deep links that trigger privileged actions should require appropriate authenticated confirmation.

### Native platform boundaries

- Inspect Android manifest permissions, exported activities/services/receivers, intent filters, backup settings, network security configuration, and release debuggability. Grant only needed permissions and keep exported components narrowly scoped.
- Inspect iOS entitlements, URL schemes/universal links, ATS exceptions, keychain access groups, background modes, and privacy usage descriptions. Avoid broad entitlements and unrestricted URL handlers.
- Verify native modules and workspace dependencies are maintained, compatible with the selected React Native architecture, and resolved once per app. Review native modules that access credentials, files, camera, location, notifications, or arbitrary URLs.
- For WebViews, disable unnecessary JavaScript/native bridges, restrict navigation to trusted origins, validate every message crossing the bridge, and block unexpected file/content access. Do not expose privileged native methods to untrusted web content.
- Ensure production builds do not expose developer menus, test accounts, verbose network inspectors, debug endpoints, or development-only certificates/configuration.

### Release and supply chain

- Check that signing credentials, private package tokens, environment secrets, and provisioning files are not committed or included in client bundles/artifacts.
- Verify environment-specific app configuration does not accidentally ship development endpoints, permissive network settings, or test identities in a production build.
- Inspect dependency changes for package-name confusion, unexpected native permissions/capabilities, install scripts, duplicate sensitive modules, and transitive packages that expand attack surface. Prefer the package manager's lockfile and declared dependencies.
- Review over-the-air update configuration as code delivery: updates must be signed/verified by the selected platform, scoped to compatible native runtime versions, and protected from untrusted update sources.

## Workflow

1. Resolve changed files and the owning mobile app/workspace from the caller. Otherwise inspect the working tree and diff when permitted by convention discovery. Include TypeScript/JavaScript, app config, package manifests, Metro config, Android, iOS, native modules, and build/release config; exclude generated output.
2. Load project security policies, threat assumptions, environment boundaries, and app/workspace ownership.
3. Trace sensitive data and trust boundaries for the changed behavior: source → storage/network/native interface → logs/analytics/UI. Inspect release-specific configuration as well as development configuration.
4. Run `reactNativeSecurityCommand` only when configured. Do not invent a tool or claim that a clean scanner proves the app is secure.
5. Report only evidence-backed findings. Prioritize by practical exploitability and impact; distinguish confirmed issues from questions caused by missing project context.

## Rules

- Project threat models and documented policies override these defaults.
- Do not recommend certificate pinning, encryption, or permissions without explaining the data/risk that requires them.
- Never print or copy secret values into findings. Identify the key/path and redact the value.
- Do not load other skills automatically.
