# Olko PR Check

## Edge Cases And Rules

- If current branch has no PR and user gives no PR number, stop. Do not guess across all open PRs.
- If PR is closed or merged, report state and stop.
- If `gh auth status` fails, report the auth problem and stop.
- If `gh pr checks` returns no checks, use `gh run list` for the PR head branch only.
- If the required workflow pattern is absent, warn once and continue. Do not wait forever on a missing workflow.
- If waiting times out, report timeout and ask whether to continue with partial data.
- If GraphQL thread resolution fails, continue with REST comments but mark resolution status unknown. Bias toward reporting possibly actionable comments instead of hiding them.
- If more than 100 review threads exist, paginate GraphQL when possible; otherwise report the cap and include newest fetched items.
- If a bot comment includes a failure link but no fix, classify it as `info` unless logs show a concrete code action.
- If a finding asks for workflow-file changes, fix CI configuration only after user explicitly selects that finding.
- If a question needs product/domain judgment, ask the user for the answer text before posting anything.
- Never post PR comments unless the user explicitly chose a path that requires posting.
- Never mark GitHub threads resolved. Resolution state is read-only here.
- Never auto-merge.
- Never skip confirmation before code edits, commit, push, or CI watch.

## Adaptation Rules

- Default required workflow pattern: `opencode`.
- Projects may override required workflow pattern, wait interval, wait cap, fix menu wording, verification command, and handoff policy in `.agents/skill-config.md` or `.agents/skills/olko-pr-check/project.md`.
- Project adapter wins over marketplace defaults. Configuration wins over project adapter.
- Do not hardcode project-specific branch names, workflow names, test commands, or reviewer/bot names beyond generic defaults documented here.

## Explicit Reuse

- This skill does not automatically load `olko-test` or `olko-commit`.
- Use those skills only when declared through `uses` in `.agents/skills/olko-pr-check/project.md`.
- If dependencies are absent, report what would be handed off and stop at the boundary.
