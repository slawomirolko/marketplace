# OpenCode agents

This catalog distributes OpenCode V1 Markdown subagents separately from the
skill registry. `index.json` is the agent manifest; it declares each agent's
stack, role, definition file, and exact skills. The installer validates that
metadata and installs only the declared skills.

Roles are deliberately separated:

- `auditor` reviews and may make scoped edits, but cannot execute shell commands;
- `implementer` changes scoped code and tests, with shell commands requiring
  approval and Git history-changing commands denied;
- `test-runner` runs the affected tests without editing files.
- `orchestrator` coordinates a bounded workflow through its explicitly
  declared skills; it does not gain access to unrelated skills.
- `comparator` is read-only and reports a bounded comparison to its calling
  orchestrator; it may declare no skills.

`olko-plan-documentation-orchestrator` performs a saved-plan workflow in this
order: `olko-plan-editor`, `olko-investigate-existing`, then an optional second
`olko-plan-editor` pass to fold verified discrepancies back into the same plan.
It is a visible primary agent, intended for direct user invocation. For each
technology in the technical document's implementation scope, it delegates a
read-only architecture and style review to the matching stack auditor. The
installer installs declared delegate agents and their declared skills with the
requesting agent.

`olko-marketplace-skill-sync-manager` is a visible primary agent for comparing
project-local skills with marketplace sources. It delegates one read-only
comparison per skill, aggregates the results, and waits for an explicit
per-skill decision before changing marketplace content, publishing, or
reinstalling anything.

The marketplace `registry.json` remains skill-only. Before adopting a newer
OpenCode major version, update the manifest format and agent permission syntax
as a compatibility change.
