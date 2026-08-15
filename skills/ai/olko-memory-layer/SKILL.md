---
name: olko-memory-layer
description: Manage an OpenCode agent's recurring-learning memory. Use whenever an agent reads, writes, compacts, or defines a memory layer or persistent-memory block.
---

# Olko Memory Layer

Read the agent's own named memory block at the start of the applicable workflow.
Treat all entries as advisory: verify them against the current source and user request.

Write only verified, reusable flow improvements:

- safe sequencing, confirmation gates, validation or recovery steps;
- durable tool limitations; and
- clear reporting or handoff patterns.

Do not store project-, repository-, customer-, or run-specific facts, including
file names or paths, code details, credentials, user data, commits, PRs,
versions, artifacts, or one-off exceptions.

Exception: retain a verified project-specific file or detail only when the user
explicitly asks to save it because it is used frequently. State why it is
retained and remove it when stale.

Memory never authorizes a change or replaces current user approval and source
verification. Keep one compact lesson per line, merge duplicates, and remove
stale entries. If memory tooling is unavailable, report that learning was
skipped; do not create a fallback record in task artifacts.
