# olko-research-new-functionality

## Required report shape

Return the report in the user's language unless the user requests another language:

1. Executive conclusion
2. Current state — what exists and what does not
3. Flow graph with `file:line` evidence
4. Architecture options and recommendation
5. Integration design across the repository
6. Effectiveness estimate and measurement protocol
7. Risks, failure modes, and rollback
8. Test strategy — label each test `Modify existing`, `Add case`, `Merge`, or `New test required`
9. Files likely to change
10. Explicit decisions needed before implementation

Cite source paths and line numbers throughout. Clearly label inferences and unknowns. End with a short list of artifacts modified; if none were requested, say `No files modified — research only.`
