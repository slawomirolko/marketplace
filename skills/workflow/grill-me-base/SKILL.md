---
name: grill-me-base
description: Interview the user one question at a time to stress-test a plan, design, or decision tree until shared understanding is reached. Minimal domain-agnostic vendored variant; reads project adapters when available and does not auto-load documentation skills. Triggers: 'grill', 'grill me', 'stress-test plan', 'challenge this design', 'grill-me-base'.
origin: vendored
---

# grill-me-base

## Purpose

Interview the user about a plan, design, or decision until both sides share the same understanding. Walk the design tree branch by branch and resolve dependent decisions in order.

## Adaptation

1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/grill-me-base/project.md` when present.
3. Apply precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
4. Run with the defaults below when no higher-priority layer overrides them.

Recognized configuration keys:

- `projectAdapter`: default `true`; controls loading the project adapter.
- `conventionDiscovery`: default `false`; when `true`, inspect the repository to answer questions that the code can answer.
- `grillQuestionMode`: default `single`; ask exactly one question per turn.
- `grillExploration`: default `code-when-answerable`; inspect code instead of asking when the answer is discoverable and allowed.

## Workflow

1. Identify the current plan, design, or decision under review.
2. Build the next unresolved decision branch.
3. Ask exactly one question and wait for the user's answer before continuing.
4. Include a recommended answer with each question.
5. If the question can be answered from the codebase and exploration is allowed, inspect the code instead of asking.
6. Continue until the decision tree has no material unresolved branches.

## Defaults

- Domain-agnostic: do not assume stack, docs layout, or project commands.
- Isolated: do not load other skills unless the project adapter explicitly declares `uses`.
- Direct: keep questions specific, dependency-aware, and actionable.
