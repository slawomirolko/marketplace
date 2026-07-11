# Olko Summary Overview

## What I Do

- Track files created or modified during current session.
- List markdown docs investigated this session.
- Summarize changes, original problem, resolved/pending status, and future steps.
- Suggest focused improvements for touched mechanisms.
- Provide verified helpful links only when useful.
- Offer to pass session-affected file set to `olko-commit`.

## When To Use

User says "summarize session", "session summary", "wrap up session", "olko-summary", or asks for an end-of-session handoff to commit.

## Adaptation

Default behavior works without project files. When project adaptation is enabled, load:

1. `.agents/skill-config.md`
2. `AGENTS.md`
3. `.agents/skills/olko-summary/project.md`

Recognized config keys:

- `projectAdapter`: when `true`, load `.agents/skills/olko-summary/project.md` if present.
- `conventionDiscovery`: default `false`; do not inspect repo conventions unless enabled or user asks.
- `readArchitectureDocs`: optional hint for whether architecture docs should be included when already relevant.

Project adapter may override section names, required summary fields, link policy, handoff wording, and project-specific docs to mention. Configuration wins over adapter; adapter wins over `AGENTS.md`; marketplace skill is fallback.
