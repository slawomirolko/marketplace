---
name: olko-ste100-skill-adapter
description: Review and adapt the wording of OpenCode skills, agents, prompts, and AI commands using ASD-STE100 for English or a Polish clarity profile inspired by STE. Preserve behavior, routing, and executable content. Recommend which related skills and agents should use these principles.
compatibility: opencode
metadata:
  opencode/slash: "true"
  opencode/autoinvoke: "false"
---

# ASD-STE100 Skill and Agent Adapter

## Purpose

Improve how AI skills, agent prompts, and natural-language commands are written. Preserve what they require the agent to do. Also identify related skills and agents where controlled-language principles would help.

This skill is an editorial workflow. It does not claim that Polish text conforms to ASD-STE100. ASD-STE100 controls English; use its clarity goals in Polish without translating its English vocabulary or grammar rules word for word.

## Inputs and scope

- Work on the exact resource path selected by the user. If no path or unambiguous target is supplied, ask for it. Do not choose a target by searching for the first matching file.
- Supported resources include `SKILL.md`, OpenCode agent Markdown, `AGENTS.md` and equivalent agent context, prompt text, and natural-language command descriptions.
- Inspect linked references only as needed to understand the target's behavior and preserve its contract.
- Do not search, read, or use files under `plans/` unless the user explicitly names one.
- Keep the user's language for discussion and recommendations. Preserve a target's required output language. A Polish-only skill remains Polish.

## Required workflow

1. Read the complete target and its relevant linked instructions. Identify its resource type, audience, language, triggers, tools, output contract, and safety or approval gates.
2. Separate operational content from wording. Keep required behavior, precedence, permissions, exact thresholds, examples that define behavior, and explicit approval gates.
3. Apply the `olko-agents-optimizer` skill's structural and discoverability review when the target benefits from it. Use the exact user-selected path. Do not force AGENTS.md section rules onto skill or agent formats. Do not remove necessary instructions merely to reduce line count.
4. Apply this skill's language review after the structural review. Make the smallest wording changes that improve clarity and consistency without changing meaning.
5. When the user asks which related skills or agents should use these principles, inspect their current responsibilities and classify them as `use STE for English technical prose`, `use Polish clarity principles`, `optional`, or `not applicable`. Give a short reason based on what each resource writes. Do not keep a repository-specific inventory or recommendation matrix in this generic skill.
6. Show the proposed edits or a focused diff and recommendations. Follow the selected structural skill's approval gate before writing. Do not edit other skills or agents unless the user includes them in scope.
7. After approval, edit only the selected resource and any explicitly selected companion resources. Re-read each changed file and report changed paths and any unresolved conformance limits.

## Language profiles

### English

- When the user requests full ASD-STE100 conformance, use the official standard and an appropriate checker if available. Do not claim conformance based only on a general language-model rewrite.
- Otherwise, use STE-inspired controlled English: prefer direct, familiar words; give a term one consistent meaning; keep sentences focused; name the actor, condition, action, and expected result; make steps and warnings explicit.
- Keep project-specific technical nouns and verbs when they are necessary. Define them where the target audience may not know them.

### Polish

Use a Polish clarity profile inspired by STE, not a literal translation of STE rules:

- Put one main instruction or claim in each sentence.
- Prefer familiar, concrete words and use each domain term consistently.
- State who acts, under what condition, what they do, and what result follows.
- Write procedures as ordered steps with direct verbs. Separate prerequisites, outcomes, exceptions, and warnings.
- Resolve vague references such as `to`, `ten`, or `jego` when their meaning is not clear.
- Use active voice when it makes responsibility clearer. Keep passive voice when the actor is unknown or irrelevant.
- Preserve natural Polish grammar, inflection, and idiom. Do not impose English word order, banned-word lists, or sentence-length quotas.

## Protected content

Do not rewrite or normalize:

- YAML frontmatter keys and values that control skill or agent identity, discovery, routing, permissions, or invocation.
- Skill names, agent names, slash commands, triggers, tool names, schema fields, identifiers, file paths, URLs, environment variables, code, shell commands, configuration, and literal output templates.
- MUST/NEVER/ONLY requirements, conditions, exceptions, thresholds, approval gates, or other behavior constraints, except to clarify their wording without weakening them.
- User-mandated language choices, including Polish descriptions in YouTrack workflows.

If protected text is unclear, flag it and propose a separate change. Do not silently modify it.

## Related resource recommendations

- Recommend STE-100 when a resource writes or edits English technical instructions or documentation.
- Recommend the Polish clarity profile when a resource writes Polish procedures, technical descriptions, or acceptance criteria.
- Mark code-only, audit-only, and operational resources as optional or not applicable when they do not author reader-facing prose.
- Inspect the current repository resources before making recommendations. Give the reason for each classification and do not rely on a fixed list embedded in this skill.
- Keep a persistent repository-wide applicability guide outside this skill. Create or update that guide only when the user explicitly selects its location and approves the scope.
- Do not inspect, recommend edits to, or modify Cave Crew resources.
- Never claim formal ASD-STE100 conformance for Polish text.

## Output

Return:

1. The target's language and resource type.
2. The structure and wording changes proposed, with behavior-preservation notes.
3. The related skill and agent recommendations with the classifications above.
4. Whether the edit was applied and any limitation on claiming formal ASD-STE100 conformance.
