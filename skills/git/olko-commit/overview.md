# Olko Commit

## Overview

## What I do
- Track files changed during the session
- Delegate style compliance to `olko-commit-style`
- Delegate AGENTS.md staleness/coverage to `olko-commit-docs`
- Delegate test execution to `olko-test`
- Delegate docker rebuild to `olko-commit-docker`
- Draft a conventional commit message
- Resolve branch policy, commit, push, and open/merge a PR

## When to use me
**Always use this skill when the user says "commit" or any variant** (e.g. "commit this", "let's commit", "time to commit", "wrap up", "summarize changes", "run tests before commit"). Also when the user asks to finish a session and push changes.

## Dependencies (uses)

This skill orchestrates sub-skills. Declare them in `uses` in the project adapter (`.agents/skills/olko-commit/project.md`):

```yaml
uses:
  - olko-commit-style
  - olko-commit-docs
  - olko-test
  - olko-commit-docker
```

Each sub-skill is optional. If a sub-skill is **not** declared in `uses`, skip its phase and continue. If declared, delegate to it and follow its result. See [Explicit Skill Reuse](../../docs/explicit-skill-reuse.md).

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `packageManager` | — | Package manager (e.g. NuGet, uv). Used for info only. |
| `deploymentTarget` | — | Deployment target. If not "Docker", skip docker rebuild. |

Layer control flags (`conventionDiscovery`, `projectAdapter`, `readArchitectureDocs`, `readTestingDocs`) are documented in the [Layered Skill Adaptation Pattern](../../docs/layered-skill-adaptation.md).

## Resolution order

1. Load `.agents/skill-config.md` (apply marketplace defaults if absent).
2. If `conventionDiscovery == true`, inspect the repo to infer conventions not stated in config. Skip when `false` or absent.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-commit/project.md`. Skip when `false` or the file is absent.
5. Execute this skill with the accumulated context.

Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.

## Flag & argument parsing

Parse `$ARGUMENTS` for flags:

| Token | Effect |
|-------|--------|
| `--force` | Commit directly to `main`/`master` (legacy path). Case-insensitive. |
| `--scope=<foo>` | Override the commit scope. Does NOT enable force mode. |
| `<free-form subject>` | Override the commit subject. Does NOT enable force mode. |

If the user is ambiguous about PR vs. direct push, default to the **PR path** (no force) and confirm before committing.

## Prerequisites
- The current directory must be a git worktree at the repo root
- `git` CLI must be available
- `gh` CLI must be available for PR creation (fallback: print manual compare URL)
