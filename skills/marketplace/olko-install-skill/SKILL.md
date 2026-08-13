---
name: olko-install-skill
description: "Install and adapt marketplace skills. With no skill name, bootstrap every missing skill without overwriting existing copies; with a name, install or reconfigure that skill. Triggers: 'install skills', 'bootstrap skills', 'install skill', 'adapt skill', 'configure skill', 'setup skill', 'optimize adaptation', 'olko-install-skill [name]'."
---

# olko-install-skill

## Routing Summary

With no requested skill name, bootstrap every missing marketplace skill without overwriting an existing local copy. With a skill name, validate and adapt only that skill.

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
