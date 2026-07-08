---
name: olko-install-skill
description: "Install and adapt a marketplace skill to the current project. Takes a skill name, validates it exists in the marketplace, inspects existing .agents adaptation, asks what to customize vs. keep, and writes .agents/skill-config.md and .agents/skills/<skill-name>/project.md. Uses strict caveman mode for prompts and low-context adaptation. Can update and optimize an already-adapted skill — proposes token reductions, behavior improvements, and marketplace contributions. Triggers: 'install skill', 'adapt skill', 'configure skill', 'setup skill', 'optimize adaptation', 'olko-install-skill <name>'."
---

# olko-install-skill

## Routing Summary
Install and adapt a marketplace skill to the current project. Takes a skill name, validates it exists in the marketplace, inspects existing .agents adaptation, asks what to customize vs. keep, and writes .agents/skill-config.md and .agents/skills/<skill-name>/project.md. Uses strict caveman mode for prompts and low-context adaptation. Can update and optimize an already-adapted skill — proposes token reductions, behavior improvements, and marketplace contributions. Triggers: 'install skill', 'adapt skill', 'configure skill', 'setup skill', 'optimize adaptation', 'olko-install-skill <name>'.

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
