# Delegate mode: subagent usage

In delegate mode the calling harness runs a factory node in its own subagent. The factory cannot see that model traffic, so it needs the harness to expose the subagent's usage. Checked on 2026-11-10 with one subagent that replies "OK" (model Claude Haiku 5.5).

## Claude Code CLI 2.1.274 (`claude -p --output-format stream-json`)

- The Agent tool starts the subagent in the background. The tool result only says `async_launched` (agent id, output file); it carries no usage.
- Completion arrives as a `system` event `task_notification` with `usage: { total_tokens, tool_uses, duration_ms }`, for example `{ "total_tokens": 29469, "tool_uses": 0, "duration_ms": 3644 }`.
- There is no input/output/cache split and no cost for the subagent. The final `result.modelUsage` is per model, so a subagent on the same model as the parent cannot be separated.

Factory consequence: record the node with `tokens.total` only, `costSource: "estimated"` (if priced from a tier rate) or `"unknown"`.

## OpenCode CLI 2.2.7 (`opencode run --format json`)

- The `subagent` tool result contains the subagent's text and its child `sessionID`; no usage.
- The parent's `step_finish` tokens cover the parent only.
- `opencode session export <childSessionID>` returns the child session with `info.parentID` and `info.tokens` split into `input`, `output`, `reasoning`, `cache.read`, `cache.write`. `cost` is 0 on a subscription login.

Factory consequence: the client passes the child `sessionID` in `factory_submit`; a reader outside the model exports the session and records full token counts (`costSource: "measured"` once priced by the factory).

## Summary

| Harness | Usage in subagent tool result | Where usage can be read | Split | Cost |
|---|---|---|---|---|
| Claude Code | no | `task_notification` event | total only | no |
| OpenCode V2 | no (session id only) | `opencode session export <id>` | full | 0 on subscription |

Delegate mode therefore gives weaker cost data than running nodes through a backend the factory calls itself (`cli` or `api` backend in `spec/factory-config.schema.json`).
