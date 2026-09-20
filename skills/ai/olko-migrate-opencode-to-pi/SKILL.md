---
name: olko-migrate-opencode-to-pi
description: "Assess and migrate a project's OpenCode workflow to Pi, covering portable skills, model access, agents, MCP, extensions, permissions, memory, and validation. Classifies every capability as portable, configure, port extension, replace workflow, or unsupported. Use when planning or executing a safe OpenCode-to-Pi transition; not for ordinary Pi setup. Triggers: 'migrate to pi', 'opencode to pi', 'olko-migrate-opencode-to-pi', 'port opencode workflow', 'pi migration'."
user_invocable: true
---

# olko-migrate-opencode-to-pi

## Routing Summary

Assess or migrate the target project's OpenCode workflow to Pi. Reuse portable project context and skills, then explicitly port OpenCode-only capabilities. Keep OpenCode live until the user approves retirement. Triggers: 'migrate to pi', 'opencode to pi', 'olko-migrate-opencode-to-pi', 'port opencode workflow', 'pi migration'.

## Progressive Loading

- Load `overview.md` first after routing.
- Load `workflow.md` when assessing or implementing the migration.
- Load `examples.md` only for a capability-map or phase-handoff output.
- Load `edge-cases.md` only for provider, compatibility, failed-validation, or retirement decisions.

## Files

- `overview.md` - scope, portability boundary, and prerequisites.
- `workflow.md` - inventory, staged port, validation, and switch criteria.
- `examples.md` - capability map and phase handoff shapes.
- `edge-cases.md` - migration safety and recovery rules.
