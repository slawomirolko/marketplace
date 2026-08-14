# Olko Investigate Existing

## Edge Cases
## Rules
- Always read source files before analyzing them — do not guess behavior.
- Discover file types, project markers, and AGENTS.md files from the repo (when `conventionDiscovery` is enabled) or from config/AGENTS.md — never assume a fixed stack list or fixed project names.
- When listing closest matches on a miss, include file paths.
- The flow graph must use real `file:line` references from the codebase, never placeholders.
- Do not create plans without user confirmation.
- Before planning new tests, prove existing tests cannot be modified, parameterized, or merged to cover the behavior.
- Prefer merging tests with the same Arrange across every test tier the repo uses.
- Include merge opportunities from touched test files in improvement plans; do not append duplicate tests beside them.
- Architecture and coding style compliance rules come from the repo's docs or declared stack-specific review skills, not from this skill; cite the doc `file:line` or delegated skill source for every violation.
- Do not auto-load technology architecture/style skills from file extensions. Use matching stack-specific skills only when declared in `uses`; otherwise report the review gap.
- Never create an AGENTS.md where none exists — only update existing ones.
- Only suggest non-inferable AGENTS.md content (skip overviews, flow diagrams, property tables, dependency lists, file indexes, test locations).
- Remove any temp files created during the investigation.
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.
- Never hardcode project-specific behavior — put it in config or the project adapter.
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-investigate-existing/project.md`.
- **Auto-update report is mandatory at Step 6d** — never skip it, even when the investigation produced only a chat summary (in that case, report "No files modified — chat-only summary" and still output the alternatives-considered block for material chat-level decisions). The report must list every file the skill touched, each change with a one-sentence *reason* (not a description), and exactly 2 rejected alternatives per material decision (not 1, not 3; if only 1 real alternative exists, the second is "leave unchanged").
- **English-only final output (Step 6e)** — regardless of the prompt language, plan/source language, or earlier turn language, the final chat output the user sees MUST be in English. Translate prose only; preserve `file:line` references, code identifiers, error codes, and already-English source quotes verbatim.
- **Step 6a-pre is mandatory when open questions or suggestions exist** — never present the old 3-option decision (`Add to plan` / `Apply now` / `Skip`) without grilling first. When `grill-with-docs` is not declared in `uses`, state the grilling gap explicitly and fall back to manual doc cross-checking, then still present the 4-option format.
- **4-option decision format replaces the old 3-option format in 6a and 6c.** The four options are: 1 `Add to plan`, 2 `Apply now`, 3 `Skip`, 4 `Alternative approach` (a genuine alternative architecture and/or technology, never a restatement of 1/2/3). Each option `description` MUST carry 3 lines for junior developer explanation + 3 lines for business consequences. Option 4 may be omitted for a single item only when no viable alternative architecture exists, with a one-sentence stated reason.
- **Do not override `grill-with-docs`'s 3-option question format.** `grill-with-docs` runs its own interview with 3 options per question; the 4-option format is `olko-investigate-existing`'s decision presentation that runs *after* the grilling, not inside it.
