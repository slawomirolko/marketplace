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

Memory does not authorize changes or replace user approval and source checks.
Keep one compact lesson per line. Record its added date and last-verified date
when the memory format supports dates. Do not guess dates.

When a verified, reusable lesson recurs, check whether the relevant skill
already covers it. If not, name the exact target skill and ask the user whether
to move the lesson there. Do not migrate it without approval. After approval,
invoke the `olko-skill-optimizer` agent for that skill path. Give it the lesson
and ask it to integrate the lesson and optimize the skill. Follow the agent's
review and approval rules. Remove the memory copy only after the skill update
is approved, applied, and verified. If the user declines, keep one memory
entry and merge duplicates.

Before writing, check any configured memory limit and its unit. If memory
exceeds the limit, remove stale or superseded lessons first, then duplicates,
then low-value or non-reusable lessons. Use age only to break ties between
lessons of similar value. Do not delete a valid lesson only because it is old.
Do not invent a limit when none is configured. If memory tooling is
unavailable, report that learning was skipped. Do not create a fallback record
in task artifacts.
