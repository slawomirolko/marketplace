# Edge Cases

## Missing Configuration
If project paths or services are not configured, do not guess. Report missing `mobileNetworkSync.*` keys and show the minimal adapter shape needed.

## VPN Or Tunnel IP
Exclude interfaces matching `NordLynx|VPN|Tunnel|ZeroTier|Tailscale|WireGuard`. Prefer `Dhcp` addresses. If the chosen address does not look like a LAN IP, rerun fallback detection and choose the WiFi adapter when identifiable.

## OAuth Domains
Do not use a raw IP for browser/OAuth redirect URLs unless the project adapter explicitly requires it. Default to `{ip}.nip.io` because some OAuth providers reject raw IP redirect URIs.

## Compose Editing
Prefer structured YAML edits. If preserving comments or anchors matters and no YAML parser is available, make the narrowest possible line edit for configured environment keys only.

## Service Rebuilds
Rebuild only configured services. Do not rebuild the entire compose stack unless the project adapter explicitly says so.

## Unreachable Services
For auth failures, report the configured auth log command when present. For API failures, report the configured API log command when present. If both are unreachable, mention firewall rules only as a likely host-network cause, not as an automatic change.

## Safety Rules
- Detect IP automatically; ask the user to run commands only after all automatic methods fail.
- Auto-apply configured source and compose URL changes.
- Never touch files outside configured paths.
- Never edit secrets, realm imports, appsettings, or unrelated infrastructure files unless the project adapter explicitly lists them.
- Do not run commit, push, release, or workflow dispatch commands unless they are configured in `mobileNetworkSync.postUpdateCommands`.
- Keep OAuth provider updates as user-visible manual action unless a project adapter provides an explicit automation command.
