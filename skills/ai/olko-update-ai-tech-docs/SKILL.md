---
name: olko-update-ai-tech-docs
description: "Investigate a technology, map it to existing AI-facing project docs, search community AI-skill and convention sources, compare gaps, present an update plan for approval, then apply approved documentation changes. Triggers: 'update AI tech docs', 'update technology docs', 'review technology conventions', 'improve coding style docs', 'compare technology against community standards', 'olko-update-ai-tech-docs <technology>'."
user_invocable: true
---

# Olko Update AI Tech Docs

## Routing Summary
Investigate AI-facing technology docs. Scan project docs plus community AI-skill/convention sources. Compare gaps across style, testing, architecture, security, build, and CI/CD. Present plan before edits. Apply only approved documentation changes.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or prompt wording is needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - small summary, config keys, defaults.
- `workflow.md` - normal execution path.
- `examples.md` - report and approval output shapes.
- `edge-cases.md` - ambiguity, web-source, and documentation-edit rules.
