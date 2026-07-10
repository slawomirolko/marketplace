---
name: olko-heartbeat
description: "End-to-end heartbeat for a mechanism, service, or flow: locate code from docker compose service or mechanism name, trace implementation, check logs/traces, supervise two iterations, run configured tests, validate AGENTS.md docs, suggest fixes, re-verify, and commit when the project adapter explicitly enables commit handoff. Triggers: 'heartbeat', 'health-check', 'verify flow', 'trace flow', 'verify service', 'olko-heartbeat'."
user_invocable: true
---

# olko-heartbeat

## Routing Summary
End-to-end heartbeat for mechanism/service/flow. Finds code from compose service or name, traces flow, checks observability, docker logs, tests, docs, fixes, re-verifies. Triggers: "heartbeat X", "health-check Y", "verify Z is working", "trace the ... flow".

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - summary, inputs, config keys, defaults.
- `workflow.md` - full heartbeat execution path.
- `examples.md` - output shape, prompts, command templates.
- `edge-cases.md` - fallback handling, safety rules, doc rules.
