# Olko PR Check

## What I Do
- Find PR from session state, current branch, or user-supplied number/URL.
- Read latest CI/CD state only.
- Read newest unresolved, non-outdated, actionable review feedback only.
- Include actionable bot comments and workflow findings.
- Summarize PR status in caveman mode.
- Ask user which findings to fix before changing code.
- After selected fixes, delegate verification/commit only when declared via `uses`.

## When To Use Me
Use when user says: "check PR", "PR check", "olko-pr-check", "sprawdz PR", "sprawdź PR", "review PR status", "what's wrong with the PR", "fix PR comments", "fix PR findings".

## Prerequisites
- Current directory is a git repo with `origin` remote pointing at GitHub.
- `gh` CLI is installed and authenticated (`gh auth status` succeeds).
- A PR exists for current branch, was tracked earlier this session, or user supplies PR number/URL.

## Dependencies (Uses)
This skill may hand off after code fixes. Declare dependencies in the project adapter (`.agents/skills/olko-pr-check/project.md`):

```yaml
uses:
  - olko-test
  - olko-commit
```

If `olko-test` is not declared, use the project adapter/configured verification command if present; otherwise ask before running broad tests. If `olko-commit` is not declared, report edited files and stop before commit/push.

## Configuration Keys
Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `prCheckRequiredWorkflowPattern` | `opencode` | Case-insensitive workflow/check name pattern that should finish before review feedback is considered complete. |
| `prCheckWaitSeconds` | `30` | Poll interval when waiting for the required workflow. |
| `prCheckWaitPolls` | `40` | Maximum polls before timeout. |
| `prCheckConventionDiscovery` | `false` | When true, infer PR/check conventions not stated in config. |

Layer control flags (`conventionDiscovery`, `projectAdapter`, `readArchitectureDocs`, `readTestingDocs`) follow the Layered Skill Adaptation Pattern.

## Resolution Order
1. Load `.agents/skill-config.md` if present; otherwise use marketplace defaults.
2. If `conventionDiscovery == true` or `prCheckConventionDiscovery == true`, inspect repo conventions needed for PR/check discovery.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-pr-check/project.md` when present.
5. Execute workflow with precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
