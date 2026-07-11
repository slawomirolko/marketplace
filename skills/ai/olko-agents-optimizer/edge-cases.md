# Agents-MD Optimizer

## Edge Cases

- **No project adapter exists** - run with marketplace defaults.
- **`projectAdapter: false`** - ignore `.agents/skills/olko-agents-optimizer/project.md` even if present.
- **Configured helper script missing** - report the missing `agentsOptimizerLineCountScript`, then use the PowerShell fallback from `workflow.md`.
- **Target auto-detection misses** - ask for `--path <path>` instead of guessing vendor-specific context paths.
- Failure handling and uncommon branches are documented inside `workflow.md`.
