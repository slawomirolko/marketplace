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
unavailable, stop and ask the user. Name the exact fix: the permission rule to
allow, or the skill or tool to install. Continue without memory only if the
user says so, and report that learning was skipped. Do not create a fallback
record in task artifacts.

## AUDIT MODE

Run on request to review, clean, compact or promote memory, or when a block
exceeds its configured limit. Never prune memory during an unrelated task.

Age each lesson in two units: days since its newest `added`/`verified` date and
runs of the owning agent since that date. Run counts alone mislead (one agent
logs hundreds of sessions in a week, another needs months), so require both.

Read the runtime database read-only (`mode=ro`), table `session_v2`:

    SELECT count(*) FROM session_v2
    WHERE agent = :agent AND time_created >= :date_ms;

`time_created` is epoch milliseconds; exclude the audit session. Fall back to
`session` only when `session_v2` is absent. Without shell, ask the caller and
label the count caller-supplied.

Verdicts:

- `DELETE-ELIGIBLE` — runs >= 30 AND age >= 30 days; still needs the
  classification below.
- `REVIEW` — runs >= 20 OR age >= 30 days.
- `FORCED REVIEW` — age >= 60 days, whatever the runs.
- `UNDATED` — no date: review by value and ask before adding one.

Classify each DELETE-ELIGIBLE lesson in this order, stopping at the first hit:

1. `DUPLICATE` — an agent definition or skill already carries the *same* rule in
   full. Grep the exact mechanism, not the topic: partial coverage is not a
   duplicate.
2. `MERGE` — the rule is partly covered, or a newer lesson restates part of it.
   Propose the edit folding both into one rule: the owning agent definition via
   `olko-agents-optimizer`, or the skill via `olko-skill-optimizer`. Delete the
   old line only after that edit is approved and applied.
3. `PROMOTE` — no carrier anywhere, generic, verified on at least two dates.
   Name the target skill or agent section and the exact sentence; route it as
   in `MERGE`.
4. `SUPERSEDED` — current code, docs or a newer lesson contradicts it. Remove it
   and cite the evidence.
5. `STILL VALID` — keep it, refresh `verified`, and say which carrier is missing.

Report one row per lesson: `file | lesson (8 words) | added | verified |
age_days | runs | verdict`, then counts per verdict, then every removed line
verbatim. Delete nothing while the run count is caller-supplied and the user has
not confirmed it. Editing an agent or skill is a proposal: never apply it
without approval.
