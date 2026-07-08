---
name: olko-adapt-to-marketplace
description: "Onboard a skill from a local directory into the marketplace and run the full release cycle, even if the skill is not yet registered. Adapts the name to the olko- convention, analyzes whether the skill should be split into smaller sub-skills orchestrated by one parent skill, proposes the marketplace category directory, prepares the skill(s) to follow the marketplace architecture (Layered Skill Adaptation Pattern, Skill Adaptation Contract, Explicit Skill Reuse), scaffolds progressive loading when warranted, optimizes for token cost and routing quality, writes the full registry entry, regenerates derived artifacts (index.json, capability-graph.json, search-index.json), and runs the validation gate until the skill passes. Triggers: 'adapt to marketplace', 'onboard skill', 'split skill', 'prepare skill for marketplace', 'register skill', 'olko-adapt-to-marketplace <name>'."
---

# olko-adapt-to-marketplace

## Routing Summary
Onboard a skill from a local directory into the marketplace and run the full release cycle, even if the skill is not yet registered. Adapts the name to the olko- convention, analyzes whether the skill should be split into smaller sub-skills orchestrated by one parent skill, proposes the marketplace category directory, prepares the skill(s) to follow the marketplace architecture (Layered Skill Adaptation Pattern, Skill Adaptation Contract, Explicit Skill Reuse), scaffolds progressive loading when warranted, optimizes for token cost and routing quality, writes the full registry entry, regenerates derived artifacts (index.json, capability-graph.json, search-index.json), and runs the validation gate until the skill passes. Triggers: 'adapt to marketplace', 'onboard skill', 'split skill', 'prepare skill for marketplace', 'register skill', 'olko-adapt-to-marketplace <name>'.

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
