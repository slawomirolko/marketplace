---
name: olko-agents-optimizer
description: "Optimize agent context files (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, .windsurfrules, codex.md, etc.), agent prompts, and SKILL.md files using Addy Osmani's agents-md methodology plus a token and cache audit (stable prefix, examples over rules, split plan). Triggers: 'optimize CLAUDE.md', 'streamline CLAUDE.md', 'agents-md', 'discoverability filter', 'add gotchas', 'optimize AGENTS.md', 'optimize context file', 'optimize .windsurfrules', 'optimize copilot-instructions', 'optimize codex.md', 'optimize agent prompt', 'reduce agent tokens', 'prompt caching'."
---

# olko-agents-optimizer

## Routing Summary
Optimize agent context files (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, .windsurfrules, codex.md, etc.), agent prompts, and SKILL.md files using Addy Osmani's agents-md methodology plus a token and cache audit (stable prefix, examples over rules, split plan). Triggers: 'optimize CLAUDE.md', 'streamline CLAUDE.md', 'agents-md', 'discoverability filter', 'add gotchas', 'optimize AGENTS.md', 'optimize context file', 'optimize .windsurfrules', 'optimize copilot-instructions', 'optimize codex.md', 'optimize agent prompt', 'reduce agent tokens', 'prompt caching'.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - smallest useful summary and normal prerequisites.
- `workflow.md` - normal execution path.
- `examples.md` - example outputs, prompts, and command snippets.
- `edge-cases.md` - failure handling, uncommon branches, and rules.
