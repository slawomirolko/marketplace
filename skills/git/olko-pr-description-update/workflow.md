# Olko PR Description Update

## Workflow — follow these steps in order

### Step 1 — Resolve context
Read configuration, `AGENTS.md`, and optional project adapter using the documented resolution order. Then collect PR number/URL, current PR body, linked issue context, change summary, and testing results.

### Step 2 — Preserve existing body
Read the current PR body before editing. Preserve useful existing sections unless the user asks to replace them. Keep the title and issue links stable.

### Step 3 — Write PBI / Bug Context
If a linked PBI/Bug exists, write exactly four English sentences in this order:
1. What the PBI/Bug required.
2. What the root problem was.
3. How this change addresses it.
4. What the observable outcome is.

If issue context is missing, ask for it before writing this section unless the user explicitly says to draft from available change context.

### Step 4 — Write Flow
Add or refresh `Flow` with one Mermaid `flowchart TD` block. Use 4-8 nodes. Node labels must be component or layer names, not code symbols or variable names. Represent the logical data/control flow introduced or modified by the change, not the full system.

### Step 5 — Keep supporting sections concise
Keep `Summary`, `Performance Impact`, and `Testing` factual. Prefer short bullets. Do not invent test results or performance claims.

### Step 6 — Update or return
If CLI update is allowed, update the PR body with the configured command. Otherwise, return the complete PR body for manual use.
