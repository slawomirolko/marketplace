---
name: olko-commit-docker
description: "Rebuild and restart docker compose services affected by committed changes. Reads the service mapping from the project adapter — never hardcodes project names. Discovers the compose file by convention. Use when olko-commit delegates docker rebuild after commit, or standalone to rebuild affected services."
---

# olko-commit-docker

## Routing Summary
Rebuild and restart docker compose services affected by committed changes. Reads the service mapping from the project adapter — never hardcodes project names. Discovers the compose file by convention. Use when olko-commit delegates docker rebuild after commit, or standalone to rebuild affected services.

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
