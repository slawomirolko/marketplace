# Olko Update AI Tech Docs Edge Cases

## Ambiguous technology

If the user provides only a broad term such as "frontend" or "backend" and the repo contains multiple matching stacks, ask for the target stack or scope before searching.

## No docs found

If no relevant project docs exist, propose the smallest useful doc set for the requested scope. Create files only after approval and only in the relevant technology directory.

## No community sources found

Report that no community skills or conventions were found. Continue with official docs or project-local recommendations only when those sources are available.

## Source quality

Prefer current official docs, primary project docs, and well-maintained community skills. Treat personal repos and stale examples as weak signals. Cite source URLs in the approval plan.

## Web access blocked

If web access is blocked, use configured `priorFindingsFile` and existing project docs. Clearly report that the community scan was skipped or incomplete.

## AGENTS.md editing

When editing `AGENTS.md`, do not add:
- broad architecture summaries
- repository maps
- dependency inventories
- generated flow diagrams
- property tables
- file indexes
- test location lists

Add only rules an agent could not reliably infer from code or existing docs.

## Approval boundary

Do not edit docs before approval unless `approvalRequired` is explicitly `false` in config. If approval is partial, apply exactly the approved subset and list skipped items in the final report.
