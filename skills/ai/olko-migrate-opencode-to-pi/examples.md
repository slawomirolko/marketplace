# Olko Migrate Opencode To Pi

## Examples

Load this file only when a capability-map or phase-handoff output shape is needed.

## Capability map

| Current capability | Pi decision | Target | Evidence required |
|---|---|---|---|
| Project `AGENTS.md` | portable | Pi context discovery | Startup reports it loaded |
| Project skills | portable | `.agents/skills/` | Intended skill is available |
| Model provider | configure | `.pi` model settings | Real tool-call session |
| OpenCode agent | port extension | Pi subagent extension | Named subagent handoff |
| OpenCode plugin | port extension | Pi lifecycle extension | Bounded behaviour check |

## Phase handoff

Report: changed files, selected model, commands run, verification result, known gap, and whether the next phase is authorized. Do not call a phase complete if its required live check was not run.
