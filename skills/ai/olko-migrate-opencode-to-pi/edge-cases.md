# Olko Migrate Opencode To Pi

## Edge Cases

## Rules

- Do not assume a model ID accepted by OpenCode is accepted by Pi or by any local provider daemon. Discover and test the actual provider model ID.
- Do not treat an installed extension or package as proof of runtime behaviour. Restart or reload Pi and run the named capability check.
- If a Pi extension cannot preserve a safety boundary, leave the equivalent OpenCode workflow active and report the blocker.
- If a migration validation fails, keep the prior phase intact, capture the first actionable failure, and do not advance to OpenCode retirement.
- Do not migrate secrets, provider tokens, user data, or unverified memory content into Pi configuration or persistent memory.
- Never remove or disable OpenCode without explicit user approval of the parity report.
