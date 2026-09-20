# Olko Migrate Opencode To Pi

## Workflow

Follow these steps in order.

### Step 1 — Inventory

Inspect `AGENTS.md`, `.agents/skills/`, `opencode.json`, `.opencode/agents/`, `.opencode/plugins/`, and the actual configured MCP/provider surfaces. Identify model access, permissions, sessions, memory, subagents, worktrees, tests, delivery, and external integrations. Compare current files before any write.

Report every inventoried capability using the classification from `overview.md`: `portable`, `configure`, `port extension`, `replace workflow`, or `unsupported`.

Do not claim parity from configuration alone. Pi's core file and shell tools do not by themselves provide OpenCode agent definitions, permission schema, an MCP client, a plugin API, orchestration, or watchdog behaviour.

### Step 2 — Target shape

Use project-local Pi configuration (default `.pi/`) for approved migration work. Keep context instructions in `AGENTS.md` and reusable workflows in `.agents/skills/`. Register only verified provider model IDs and configure compaction explicitly. Implement Pi-specific behaviour as small TypeScript extensions under the configured extensions directory (default `.pi/extensions/`) or an approved Pi package.

Do not copy broad OpenCode prompts or tool catalogs. Preserve only instructions and tools that protect data, Git history, external services, or required verification.

### Step 3 — Staged port

Complete each stage only after its validation succeeds:

1. Start Pi with project context, shared skills, the chosen provider model, and compaction.
2. Port permission and path policy before enabling autonomous writes. Preserve confirmation gates and prohibited Git actions.
3. Port each required MCP server through a Pi adapter or extension. Verify discovery and one bounded read-only call per server.
4. Translate specialized agents into Pi subagent configuration or extensions with isolated context, a declared model, allowed tools, and an output contract. Preserve exclusive file ownership for parallel writers.
5. Port verified persistent-memory rules and recreate lifecycle controls, including any handoff-before-abort watchdog behaviour.
6. Port worktree, test, delivery, and knowledge-base workflows without weakening their existing approval boundaries.

### Step 4 — Validation

For every migrated capability, record configuration, command, model, result, and first actionable failure. Verify project context and skills loading, a real tool call, compaction state continuity, permission blocking, MCP calls, named subagent handoff, watchdog handoff, and the affected test, Git, worktree, and knowledge-base workflows.

Do not call a phase complete if its required live check was not run.

### Step 5 — Parity report and retirement

Produce a parity report before proposing retirement. Remove or disable OpenCode only after the user explicitly approves the switch.

Report: changed files, selected model, commands run, verification result, known gap, and whether the next phase is authorized.
