# Mobile Network Sync Workflow

## Step 1 - Load adaptation layers
Read `.agents/skill-config.md`. If `projectAdapter` is not false and `.agents/skills/olko-mobile-network-sync/project.md` exists, read it next. Read relevant `AGENTS.md` files for operational constraints.

Apply precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

If required project configuration is missing, report the missing keys and stop after IP detection. Do not infer project-specific paths, service names, realms, ports, or CI commands.

## Step 2 - Detect the host LAN IP
On Windows, run:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Hyper-V|VirtualBox|DockerNAT|WSL|NordLynx|VPN|Tunnel|ZeroTier|Tailscale|WireGuard' -and $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object @{ Expression = { if ($_.PrefixOrigin -eq 'Dhcp') { 0 } else { 1 } } } | Select-Object -ExpandProperty IPAddress -First 1
```

If that returns empty, run:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' -and $_.IPAddress -notmatch '^127\.' } | Select-Object -ExpandProperty IPAddress -First 1
```

Last resort:

```powershell
ipconfig | Select-String "IPv4" | ForEach-Object { ($_ -split ': ')[-1].Trim() }
```

Pick the first non-`127.x.x.x` LAN address (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`). Store it as `HOST_IP`.

If no LAN IP is found, report `No LAN IP detected - is the host connected to WiFi?` and stop.

Compute `HOST_DOMAIN` from `mobileNetworkSync.domainTemplate`. Default template is `{ip}.nip.io`.

## Step 3 - Read current configured URLs
For each `mobileNetworkSync.urlUpdates` item:

- Read `path`.
- Match `regex`.
- Extract the URL or host portion identified by the item.
- Record the current host/IP for the final report.

For `mobileNetworkSync.composePath`, read compose data through a YAML parser when available. If no YAML parser is available, make a minimal line-preserving edit only for configured environment keys.

If all configured targets already match `HOST_IP` or `HOST_DOMAIN` as appropriate, report that no source updates are needed and continue to verification.

## Step 4 - Apply URL updates
For each `mobileNetworkSync.urlUpdates` item, render `replacementTemplate` with:

- `{hostIp}` = `HOST_IP`
- `{hostDomain}` = `HOST_DOMAIN`

Use `HOST_DOMAIN` for OAuth/auth browser-facing URLs unless the target name is listed in `mobileNetworkSync.rawIpTargets`. Use raw `HOST_IP` for direct API URLs when configured that way.

Edit only the configured files. Preserve surrounding formatting.

## Step 5 - Fix compose auth authority
For each `mobileNetworkSync.composeEnvUpdates` item:

- Locate the configured service in `mobileNetworkSync.composePath`.
- Add the environment key if missing.
- Replace `localhost` with `HOST_DOMAIN` when present.
- Render configured value templates with `{hostIp}` and `{hostDomain}`.

Do not touch unrelated compose services or unrelated infrastructure files.

## Step 6 - Rebuild and restart configured services
If `mobileNetworkSync.services` is non-empty, run:

```powershell
docker compose build <services>
docker compose up -d <services>
```

Wait up to `mobileNetworkSync.healthWaitSeconds` (default `60`) for configured services to report healthy when health checks exist.

Check service health with:

```powershell
docker compose ps <services> --format json
```

Parse JSON lines when possible. Report each service status and health.

## Step 7 - Verify host reachability
Render and request configured verification URLs:

- `mobileNetworkSync.authDiscoveryUrlTemplate`
- `mobileNetworkSync.apiHealthUrlTemplate`
- `mobileNetworkSync.adminUrlTemplate`

Use `Invoke-WebRequest -TimeoutSec 5 -UseBasicParsing` on Windows. A discovery check passes when the response contains the expected issuer if `mobileNetworkSync.expectedIssuerTemplate` is configured. An API health check passes when the response matches `mobileNetworkSync.expectedApiHealth` when configured. An admin check passes on a configured expected status, default `200`.

If a check fails, report the failing URL, status or error, and the relevant configured log command if present.

## Step 8 - Report OAuth redirect action
If `mobileNetworkSync.redirectUriTemplate` exists, render it and tell the user to add that exact URI to the OAuth provider's authorized redirect URIs.

Do not pause for confirmation. State the console URL from `mobileNetworkSync.oauthConsoleUrl` when configured.

## Step 9 - Optional post-update commands
Run `mobileNetworkSync.postUpdateCommands` only when they are explicitly configured for the project. Treat irreversible commands such as `git commit`, `git push`, release creation, and workflow dispatch as project-specific behavior. Preserve the command text exactly and report the result.

## Step 10 - Final report
Report:

- Host LAN IP.
- Host domain.
- Previous host values.
- Files updated.
- Compose authority fix result.
- Services rebuilt/restarted.
- Service health.
- Reachability checks.
- OAuth redirect URI.
- Post-update command results.
