---
name: olko-adapt-to-marketplace
description: "Adapt a local skill for Marketplace onboarding, or with --local-only restructure it in its project without publishing. Can rename, split into parent/sub-skills, add SemVer, optimize routing, and scaffold progressive loading. Local-only mode forbids Marketplace registry edits, copies, and publication. Triggers: 'adapt to marketplace', 'onboard skill', 'split skill', 'prepare skill for marketplace', 'adapt local skill', 'restructure local skill', 'olko-adapt-to-marketplace <name>'."
---

# olko-adapt-to-marketplace

## Routing Summary
Onboard a skill into the Marketplace, or use `--local-only` to rename, split, version, and optimize it in its project without registering or publishing it. Triggers: 'adapt to marketplace', 'onboard skill', 'split skill', 'prepare skill for marketplace', 'adapt local skill', 'restructure local skill', 'olko-adapt-to-marketplace <name>'.

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
