# Olko Summary Workflow

## Step 1 - Resolve Adaptation Layers

1. Read `.agents/skill-config.md` when present.
2. Read applicable `AGENTS.md` files.
3. If `projectAdapter == true`, load `.agents/skills/olko-summary/project.md` when present.
4. Apply precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.

## Step 2 - Discover Session-Affected Files

Track every file created or modified during this session through tool usage.

Include:

- Files created in this session.
- Files modified in this session.
- Project-level files affected by those edits.

Exclude temporary `.txt` and `.log` files after cleaning them up when appropriate.

Do not use `git diff`, `git status`, or `git diff --cached` to discover this list. Git may include user work outside the session.

## Step 3 - List Investigated Markdown Files

List markdown files read or consulted during this session:

- `AGENTS.md` files.
- `CODING_STYLE.md` files.
- `SKILL.md` files.
- `.agents/skills/<skill-name>/project.md` adapters.
- Other `.md` files read during the work.

## Step 4 - Summarize Changes

For each session-affected file, describe what changed and why. Group by logical area rather than line-by-line detail.

Use:

- New files created.
- Files modified.
- Generated artifacts, when relevant.

## Step 5 - Summarize Problem

State the original issue, request, or need in 2-4 concise sentences. Include the desired outcome.

## Step 6 - Report Status

State what is resolved and what remains pending. If nothing remains, say that directly.

## Step 7 - Future Steps

List concrete next actions only when useful:

- Implementation tasks left.
- Review or QA.
- Deploy, rebuild, migrate, or restart steps.
- Follow-up sessions.

If none, state that no future steps are needed.

## Step 8 - Suggested Improvements

Suggest improvements for touched mechanisms only when grounded in the work:

- Performance.
- Maintainability.
- Architecture or patterns.
- Test coverage.
- Observability.
- Error handling.

If none are useful, state that none were identified.

## Step 9 - Helpful Links

Provide links only when they materially help with suggested improvements. Never fabricate URLs. Verify uncertain links before including them. Prefer official docs and primary project pages.

## Step 10 - Optional `olko-commit` Handoff

After the summary, report the session-affected file list as the source of truth for a later `olko-commit` call.

Ask: "Proceed to `olko-commit` with this file set?"

Only load or invoke `olko-commit` when the user confirms or when project adapter explicitly declares and requests that handoff.
