---
name: olko-feature-planner
description: Turn broad product outcomes into an Epic with business value and progress by Feature, then define user-facing Features and independently testable, one-PR Tasks. For implementation planning, return the complete accepted Feature/Task hierarchy to the orchestrator, which creates every Task plan in the same session.
---

# olko-feature-planner

## Routing Summary
Turn a rough product idea, or an existing Epic, Feature, or Task, into an Epic with business value, user-facing Features, and independently testable one-PR Tasks. Owns the backlog and the two-pass tracker handoff; stops after the accepted hierarchy. Triggers: 'feature planner', 'plan a Feature', 'break this into Tasks', 'Epic planning', 'olko-feature-planner'.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - purpose, when to use, prerequisites, and the decision-batch rule.
- `workflow.md` - the normal planning path: recalculate scope, Feature, Epic, Tasks, plan handoff, tracker handoff, language.
- `examples.md` - the six-section Task description example.
- `edge-cases.md` - approval gates, context mode, checklist, and strict rules.
