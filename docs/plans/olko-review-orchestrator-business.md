# olko-review-orchestrator — business

Technical: [olko-review-orchestrator-technical.md](olko-review-orchestrator-technical.md)

## Problem
- Many review skills overlap. Same rules live in several catalogues; `olko-design-rules` already merges them.
- No single read-only reviewer. Existing stack auditors can edit code.
- No shared false-positive filter. No shared priority order.

## Users and value
- Developer reviewing own branch or colleague PR.
- One command → one ranked findings list. No code change. Fewer false positives.

## Mechanism
Input: PR number/URL, branch, or current diff.

Route: user's own PR → work through CI status and review comments (plan per comment, then fix, test, reply; threads never resolved). Someone else's PR or local diff → review below.

1. Read diff. Detect changed stacks: .NET, React, Kotlin, Python.
2. Run lenses in parallel, each read-only:
   - bugs + security (all files)
   - one lens per detected stack: architecture, style, tests, design rules, scoped `AGENTS.md`/`CLAUDE.md`
3. Verify each finding with second agent. Drop unconfirmed + known false positives.
4. Rank: bug → security → repo rule → design → style → nit.
5. Report to user. Optional: post PR comments, one approval per comment.
6. Remember outcome: skipped twice → suppress pattern; approved once → prioritize.

Output: `path:line | rule-id | sev | problem | fix`.

Language: agents talk caveman ultra. User report caveman full. Security findings plain English.

## Scope
- In: new review flow over existing stack and design-rule skills.
- Out: auto-fixing code on someone else's PR. Docker files (no docker stack in agent manifest yet).

## Risks
- Ultra compression drops detail → fixed finding schema mitigates.
- Lens overlap → duplicate findings → merge step dedups by `path:line + rule-id`.

## Success
- One run per PR, zero file edits.
- Every finding has rule id + suggested fix.
- Each reported finding passed the verify step.
