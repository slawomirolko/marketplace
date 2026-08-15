# olko-research-new-functionality

## Edge cases and strict rules

- Keep the work read-only unless the user explicitly requests an artifact or implementation.
- Do not create README, SUMMARY, INDEX, or other Markdown files automatically; write a report file only when the user names or explicitly requests one.
- Do not recommend LLM-only computation for reproducible statistical features. Let the backend calculate, version, validate, and persist the feature; let the AI layer interpret or fuse it.
- Do not claim a feature affects a decision until the current write path, snapshot, thresholds, and lifecycle behavior have all been inspected.
- Do not put durable business rules only in prompts or in-memory state.
- Treat saved plans, AGENTS text, and comments as hypotheses until confirmed by live code.
- Preserve unrelated user changes; inspect `git status --short` before any edit.
