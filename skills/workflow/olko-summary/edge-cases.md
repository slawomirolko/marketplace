# Olko Summary Edge Cases

## Strict Rules

- Never use `git diff`, `git status`, or `git diff --cached` to discover session-affected files.
- Use only files tracked through this session's create/edit tool usage.
- Never guess URLs. Verify or omit.
- Never create markdown files unless explicitly requested.
- Keep summaries concise.
- Follow `AGENTS.md` and project adapter overrides.
- Do not auto-load other skills. `olko-commit` handoff requires confirmation or explicit project adapter behavior.

## No Changed Files

If no files were created or modified in this session, state "No files changed in this session" and continue with investigated docs, problem, status, and next steps.

## Missing Project Adapter

If `.agents/skills/olko-summary/project.md` is absent, run default marketplace behavior.

## Adaptation Disabled

If `projectAdapter` is false or absent, do not load the project adapter. Use config, `AGENTS.md`, and marketplace defaults.

## Uncertain Links

If link validity is uncertain and browsing is not requested or available, omit the link. Prefer no link over a fabricated or stale link.
