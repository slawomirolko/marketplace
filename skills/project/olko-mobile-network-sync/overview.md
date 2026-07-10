# Mobile Network Sync

## What I Do
- Detect host LAN/WiFi IPv4.
- Build optional host domain from IP, usually `<ip>.nip.io`.
- Update configured source files containing mobile auth and API base URLs.
- Update configured compose environment URLs.
- Fix configured container auth authority when missing or pointing to localhost.
- Rebuild configured services.
- Verify auth discovery, API health, and admin reachability.
- Report exact OAuth redirect URI user must allow.

## When To Use
User says "sync mobile network", "fix phone login over WiFi", "make app work on my network", "update mobile IP", or "mobile network sync".

## Adaptation
Load `.agents/skill-config.md`, then `.agents/skills/olko-mobile-network-sync/project.md` when project adapters are enabled. Precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Without project config, detect IP and stop with config-needed report. Do not guess file paths, service names, realms, or workflow commands.

## Configuration Keys
| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Whether to load `.agents/skills/olko-mobile-network-sync/project.md`. |
| `mobileNetworkSync.composePath` | — | Compose file to update. |
| `mobileNetworkSync.urlUpdates` | `[]` | List of file replacements with path, regex, target kind, and replacement template. |
| `mobileNetworkSync.composeEnvUpdates` | `[]` | Compose environment keys to add/update. |
| `mobileNetworkSync.domainTemplate` | `{ip}.nip.io` | Host domain template for OAuth-safe URLs. |
| `mobileNetworkSync.rawIpTargets` | `[]` | Target names that must use raw IP instead of domain. |
| `mobileNetworkSync.services` | `[]` | Compose services to rebuild/restart/check. |
| `mobileNetworkSync.authDiscoveryUrlTemplate` | — | Discovery URL template for verification. |
| `mobileNetworkSync.apiHealthUrlTemplate` | — | API health URL template. |
| `mobileNetworkSync.adminUrlTemplate` | — | Admin URL template. |
| `mobileNetworkSync.redirectUriTemplate` | — | OAuth redirect URI to report. |
| `mobileNetworkSync.postUpdateCommands` | `[]` | Optional project commands such as commit, push, or CI trigger. |
