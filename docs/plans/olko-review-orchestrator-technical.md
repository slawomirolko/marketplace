# olko-review-orchestrator — technical

Business: [olko-review-orchestrator-business.md](olko-review-orchestrator-business.md)

## Files
`agents/opencode/`
- `olko-review-orchestrator.md` — primary, role `orchestrator`. `edit: deny`. Task: only lenses + verifier.
- `olko-review-bugs-lens.md` — hidden, role `investigator`, stack `cross-stack`. Bugs + security, diff only.
- `olko-review-dotnet-lens.md` — hidden, `investigator`, `dotnet`.
- `olko-review-react-lens.md` — hidden, `investigator`, `react`.
- `olko-review-mobile-lens.md` — hidden, `investigator`, `mobile`.
- `olko-review-python-lens.md` — hidden, `investigator`, `army-python`.
- `olko-review-verifier.md` — hidden, `investigator`, `cross-stack`. Confirms or rejects findings.
- `olko-review-feedback-handler.md` — hidden, `implementer`, `cross-stack`. Own-PR route: `olko-pr-check`, plan per comment, fix, `olko-test`, replies, `olko-commit`.
- `index.json` — register 8 agents.
- `README.md` — one paragraph on the review orchestrator.

Stack lenses also load `olko-dotnet-security`, `olko-react-security`, `olko-kotlin-security`. Python has no security skill; bugs lens covers it.

`scripts/install-opencode-agents.test.mjs` — new tests.

## Flow
```
orchestrator
 ├─ route: PR author == gh user → feedback-handler (stop); else review
 ├─ resolve diff (gh pr diff | git diff merge-base)
 ├─ detect stacks by extension (.cs/.csproj, .ts/.tsx, .kt/.kts, .py)
 ├─ parallel task: bugs-lens + one <stack>-lens per detected stack
 ├─ merge + dedup (path:line + rule-id)
 ├─ verifier (parallel, batches of findings)
 ├─ rank: bug > security > repo-rule > design > style > nit
 ├─ olko-memory-layer load/update (suppress rejected>=2, prioritize confirmed>=1)
 └─ report caveman full; post comment only per-comment approval (bash ask)
```

## Patterns
- Same delegation shape as `olko-plan-documentation-orchestrator`.
- Read-only by permission: every agent `edit: deny`; lenses + verifier `bash: deny`; orchestrator bash allow-list `git diff*`, `git log*`, `git merge-base*`, `gh pr view*`, `gh pr diff*`; `gh pr comment*`, `gh api*` = `ask`.
- Inter-agent schema, caveman ultra: `path:line | rule-id | sev(bug|risk|nit|q) | problem | fix`.
- Security finding: plain English sentence first.

## Tradeoffs
- One lens per stack (chosen): tight skill allow-list per agent, matches manifest `stack` field, lenses run in parallel.
- New lenses vs reuse `olko-*-auditor`: auditors have `edit: allow` + improve mode. Chose new read-only agents.

## Implementation readiness
Ready for implementation: **yes**

1. Architecture/owner: pattern `agents/opencode/olko-plan-documentation-orchestrator.md`; installer `scripts/install-opencode-agents.mjs`.
2. Dependencies: all manifest skills in `registry.json`.
3. Instrumentation: n/a (prompt agents).
4. Runtime verification: install into a project; run on one known PR; compare with manual review.
5. Errors: no PR / no diff → stop. Lens failure → report lens missing, never claim full pass.

## Open items
- ACCEPTED-GAP: Docker files not reviewed (manifest stack set has no docker).
- VERIFY-DURING-WORK: port to Claude via `olko-port-opencode-to-claude`.

## Tests
`scripts/install-opencode-agents.test.mjs`
- `installs the review orchestrator with read-only stack lenses`
- `review lenses and verifier deny edit and bash`
- `declares a valid SemVer version for every OpenCode agent` (existing, covers new entries)
