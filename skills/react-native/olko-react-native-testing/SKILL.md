---
name: olko-react-native-testing
version: 1.1.0
description: "Review and run React Native tests across logic, components, navigation, native integration, and device-level user flows. Apply configured Jest/React Native Testing Library and E2E conventions, check meaningful assertions and platform coverage, and report failures without hiding unavailable infrastructure. Use when validating React Native tests or adding mobile feature coverage."
---

# React Native Testing

Review tests for changed React Native behavior against project rules and these defaults. Report convention issues and real command failures. Do not add tests or change application code unless asked or authorized by the parent workflow.

## Adaptation and configuration

Resolve rules in this order:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace defaults
```

Read `.agents/skill-config.md`, applicable `AGENTS.md` and `TESTING.md` files. Unless `projectAdapter: false`, also read `.agents/skills/olko-react-native-testing/project.md` when present. Infer undocumented conventions only when `conventionDiscovery` is enabled or the user asks.

Recognized configuration keys:

| Key | Default | Purpose |
|---|---|---|
| `reactNativeTestCommand` | none | Unit/component test command. |
| `reactNativeTypecheckCommand` | none | Type checking command, if part of the test gate. |
| `reactNativeE2ECommand` | none | Configured device/simulator E2E command. |
| `reactNativeProjectRoot` | nearest app manifest (`package.json` or `app.json`) | Override app root. |
| `reactNativeWorkspaceRoot` | nearest workspace root, only when convention discovery is enabled | Override workspace root. |
| `reactNativeTestTimeoutMs` | `120000` | Timeout for configured test commands. |
| `reactNativeTestSourceRoots` | discovered only when convention discovery is enabled | Test source roots. |
| `reactNativeTestingDocs` | `TESTING.md` | Additional test guidance to read when present. |
| `readTestingDocs` | `true` | Read test docs. |
| `conventionDiscovery` | `false` | Permit repository convention discovery. |
| `projectAdapter` | `true` | Load the project adapter. |

## Marketplace defaults

- Separate pure business/state logic tests from component rendering tests and device-level tests. Do not write UI tests for logic already covered at the appropriate lower layer.
- Unit tests cover deterministic logic and error/boundary cases. Component tests use Jest and React Native Testing Library when configured, drive visible controls as a user would, and assert visible/accessibility output rather than implementation state, private props, or navigation method calls.
- Navigation behavior should use a real navigator where practical. Test the screen/result visible after the interaction, including typed route parameters and deep-link entry when relevant.
- Mock external network boundaries for deterministic JS tests; verify request/response serialization, auth/error mapping, and contract edge cases. Keep mocks at the boundary and avoid replacing the behavior under test.
- Test loading, success, empty, error, retry/refresh, and important concurrent or stale-response behavior where the feature exposes them.
- Use device/emulator E2E tests for critical user journeys and native behavior that JS component tests cannot exercise: authentication entry, permissions, notifications, deep links, secure storage, and platform-specific flows. Choose the project's configured tool (for example Maestro or Detox); do not require one universally.
- New user-facing flows should have at least one observable happy-path test at the level that exercises their public entry point, plus focused unit tests for important edge/error cases. Avoid duplicating the same assertion across every test layer.
- Do not add skipped tests or environment-based silent passes. When a simulator, service, or credential is unavailable, report the actual blocker and keep the test executable.
- Assert user-visible text, roles, labels, and outcomes. Use test IDs only when no accessible selector is stable.
- Keep tests independent, deterministic, and small. Reuse fixtures; parameterize repeated cases. Avoid large snapshots as a substitute for behavioral assertions.

## Workflow

1. Resolve changed source and directly related tests from the caller; otherwise inspect working tree and diff. Include workspace manifests and app-level test/build config when relevant; exclude generated code.
2. Load adaptation sources and map changed features to unit, component, integration, and E2E coverage. Read project test docs before judging conventions.
3. Check assertion quality, test-double boundaries, platform/native coverage, duplicate setup, skip behavior, and gaps for new user-facing flows.
4. Run configured test/type-check commands only when requested by the caller or required by project instructions. Use `reactNativeTestTimeoutMs`; run E2E only with a configured command and available device/tooling.
5. In workspaces, verify each package's tests run at its owning package root and app integration tests resolve the intended workspace packages. Do not assume a root command tests every workspace unless documented.
6. Report convention findings and exact command outcomes. State explicitly when tests were not run or could not run.

## Rules

- Follow project test strategy when it differs from these defaults.
- Do not invent test commands, simulator setup, endpoints, or credentials.
- Do not load other skills automatically.
