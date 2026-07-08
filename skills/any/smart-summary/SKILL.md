---
name: smart-summary
description: End-of-session summary — track session-affected files, list investigated docs, summarize changes and problems, outline solved/pending issues, future steps, improvement suggestions, and helpful links
user_invocable: true
---

# Smart Summary

## What I do
- Discover and register all files created/modified during the session as "session-affected" files (usable by subsequent `smart-commit` calls)
- List all markdown files investigated during the session
- Summarize what was changed in this session
- Summarize the problem(s) being solved
- Outline which problems were resolved and which remain
- List concrete future steps (if applicable)
- Suggest future improvements, tweaks, and optimizations for the affected mechanism(s)
- Provide web links for learning more about the suggested improvements

## When to use me
User says "summarize the session", "session summary", "wrap up the session", "smart-summary", or any variant asking for an end-of-session summary and file tracking handoff to `smart-commit`.

---

## Step 1 — Discover session-affected files

Track every file created (Write tool) or modified (Edit tool) during this session. Maintain a running list throughout. At summary time, this list constitutes the session-affected files.

**To build the list:**
- Include every file created via the Write tool during this session
- Include every file modified via the Edit tool during this session
- Include any project-level files (`.csproj`, `compose.yaml`, etc.) affected
- Exclude temporary `.txt`/`.log` files (clean those up first)

❌ Do NOT use `git diff`, `git status`, or `git diff --cached` to derive this list.
✅ Use ONLY files tracked via Write/Edit tool usage in this session.

Store the list internally. This list will be handed off to `smart-commit` as the session-affected file set.

---

## Step 2 — List investigated markdown files

Identify all `.md` files that were read or consulted during this session:

- AGENTS.md files (`dotnet/AGENTS.md`, `agents/AGENTS.md`, project/slice-level AGENTS.md)
- CODING_STYLE.md files
- Skill SKILL.md files
- Plan files (`.claude/skills/plan-editor/plans/`)
- Any other `.md` files read via the Read tool

Present the list as:
```
## Markdown files investigated this session:
  - dotnet/AGENTS.md
  - .claude/skills/smart-commit/SKILL.md
  - ... (or "None" if none)
```

---

## Step 3 — Summary of changes

For each file from Step 1, describe what was changed and why:

- Use file path and a one-line description of the change
- Group by logical area (e.g. "New skill", "Bug fix", "Test additions")
- Focus on intent, not file-by-file line accounting

Present as:
```
## Changes made this session:
  ### New files created:
    - <path> — <what it does>
  ### Files modified:
    - <path> — <what was changed and why>
```

---

## Step 4 — Summary of the problem

Describe the problem(s) this session addressed:

- What was the original issue, bug, feature request, or need?
- What was the desired outcome?
- Keep it concise (2–4 sentences)

Present as:
```
## Problem addressed:
  <description of the problem being solved>
```

---

## Step 5 — Resolved vs. pending

Produce a paragraph describing:

- Which problems were resolved during this session
- Which problems are still pending / need follow-up

Present as:
```
## Status:
  **Resolved:** <what was completed this session>
  **Pending:** <what remains to be done, if anything>
```

---

## Step 6 — Future steps

List concrete, actionable future steps (if applicable):

- Implementation tasks left to do
- Review steps needed (PR review, QA)
- Deployment steps (rebuild, migrate, restart)
- Follow-up sessions or related work

If none, state "No future steps — session is complete."

Present as:
```
## Future steps:
  1. <step>
  2. <step>
  ... (or "None")
```

---

## Step 7 — Future improvements / tweaks / optimizations

Suggest improvements for the mechanism(s) touched this session:

- Performance optimizations
- Code quality / maintainability improvements
- Architecture or pattern refinements
- Test coverage gaps
- Observability / monitoring additions
- Error handling hardening

Present as:
```
## Suggested improvements:
  - <improvement 1>
  - <improvement 2>
  ... (or "None identified")
```

---

## Step 8 — Helpful web links

For each suggestion from Step 7, provide relevant web links that help the user learn more:

- Official docs (Microsoft Learn, Python docs, library docs)
- Blog posts or articles on the topic
- GitHub repos or samples
- Reference implementations

❌ NEVER guess or fabricate URLs. Only include links you are confident are valid.
✅ Use `webfetch` to verify a link's existence if uncertain.
✅ Prefer `learn.microsoft.com`, `docs.python.org`, `github.com` project pages, and well-known library docs.

If no links are applicable, state "No links to suggest for this session."

Present as:
```
## Helpful links:
  - [<title>](<url>) — <why it's relevant>
  ... (or "None")
```

---

## Final summary format

All sections combined, produce:

```
# Session Summary — <brief title>

## Markdown files investigated this session:
  - <list or "None">

## Changes made this session:
  ### New files created:
    - ...
  ### Files modified:
    - ...

## Problem addressed:
  ...

## Status:
  **Resolved:** ...
  **Pending:** ...

## Future steps:
  ...

## Suggested improvements:
  ...

## Helpful links:
  ...
```

---

## Integration with smart-commit

**After producing the final summary**, register session-affected files for the `smart-commit` skill:

1. Report the full list of session-affected files (from Step 1) in the summary output
2. Instruct the user: the next `smart-commit` call will use these files as the source of truth (per `smart-commit` Step 1, which says "only process files that YOU wrote or edited during this session")
3. Since `smart-summary` is designed to be called before `smart-commit`, the file list from Step 1 IS the session-affected set that `smart-commit` should honor

Ask: "Would you like to proceed to smart-commit with this file set? (y/n)"

If yes, load the `smart-commit` skill and pass the file list as the session-affected scope.

---

## Rules
- Never use `git diff` or `git status` to discover changes — use only Write/Edit tracked files
- Remove temp `.txt`/`.log` files before finalizing the summary
- Never guess URLs — verify or omit
- Never create markdown files unless explicitly requested
- Keep summaries concise — no fluff
- Follow all rules from `AGENTS.md` (no markdown generation without explicit request)
- If no files were changed, state "No files changed in this session" and skip to Step 2
