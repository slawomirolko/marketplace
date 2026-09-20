# Olko Migrate Opencode To Pi

## Overview

## What I do

Use this skill only for a deliberate OpenCode-to-Pi assessment or migration in the target project. Keep the existing OpenCode configuration and runtime usable until the user explicitly approves retiring it.

Pi directly discovers `AGENTS.md` and `.agents/skills/` from the project. Treat those as portable. Treat `opencode.json`, `.opencode/agents/`, `.opencode/plugins/`, OpenCode MCP configuration, permission rules, session plugins, and agent definitions as OpenCode-specific until a tested Pi equivalent exists.

Do not overwrite `.opencode/`, alter provider credentials, install packages, or make external provider changes without the authorization required for that action. Preserve unrelated uncommitted changes.

Report every inventoried capability as one of:

- `portable` - works in Pi without modification;
- `configure` - requires Pi settings or model registration only;
- `port extension` - needs a narrow Pi TypeScript extension;
- `replace workflow` - needs a different Pi-native workflow; or
- `unsupported` - cannot safely meet the requirement.

Pi's core file/shell tools do not by themselves provide OpenCode agent definitions, permission schema, MCP client, plugin API, orchestration, or watchdog behaviour. Do not claim parity from configuration alone.

## When to use me

User says "migrate to pi", "opencode to pi", "port opencode workflow", or "pi migration". Do not use for ordinary Pi setup.

## Adaptation

Read `.agents/skill-config.md` first. If `projectAdapter` is not `false`, load `.agents/skills/olko-migrate-opencode-to-pi/project.md` when present. Precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Recognized keys:

| Key | Default | Meaning |
|-----|---------|---------|
| `projectAdapter` | `true` | Whether to load `.agents/skills/olko-migrate-opencode-to-pi/project.md` |
| `piConfigDir` | `.pi` | Project-local Pi configuration directory for approved migration work |
| `piExtensionsDir` | `.pi/extensions` | Directory for Pi-specific TypeScript extensions |
| `skillsDir` | `.agents/skills` | Portable skills directory discovered by Pi |
| `providerModelId` | discovered from the provider | Verified Pi provider model ID to register — never assume an OpenCode model ID carries over |
| `ollamaConfigPath` | provider default | Path to the provider daemon configuration used to discover model IDs |

Defaults above apply when no configuration or project adapter overrides them.
