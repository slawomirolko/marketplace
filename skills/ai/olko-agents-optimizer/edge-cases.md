# Agents-MD Optimizer

## Edge Cases

- **No project adapter exists** - run with marketplace defaults.
- **`projectAdapter: false`** - ignore `.agents/skills/olko-agents-optimizer/project.md` even if present.
- **Configured helper script missing** - report the missing `agentsOptimizerLineCountScript`, then use the PowerShell fallback from `workflow.md`.
- **Target auto-detection misses** - ask for `--path <path>` instead of guessing vendor-specific context paths.
- **Agent prompt or SKILL.md target** - never remove or reword hard rules, permissions, tool lists, thresholds, or invocation contracts to meet a word budget; report the budget gap instead.
- **Split plan needs new skills** - output the plan only; this skill never creates skills or loads other skills. The caller executes it after approval.
- **`prefixIssues` hit inside static instruction text** - a literal that never changes between runs does not break the cache; keep it when it carries a rule, delete it when it is a stale note.
- **Provider not in the reference** - say its caching behavior is unverified; do not guess.
- Failure handling and uncommon branches are documented inside `workflow.md`.
