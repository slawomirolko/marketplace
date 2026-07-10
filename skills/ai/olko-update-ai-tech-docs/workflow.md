# Olko Update AI Tech Docs Workflow

## Step 1 - Resolve technology and scope

Parse the user's technology argument into:
- language/platform
- domain
- scope: coding style, testing, architecture, security, build tooling, CI/CD, or all

If the technology is ambiguous, ask the user which areas to focus on. Do not guess when the requested scope would change which files are edited.

Load adaptation layers in this order:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read `.agents/skill-config.md` and `.agents/skills/olko-update-ai-tech-docs/project.md` when present. Use configured `technologyDocRoots`, `communitySources`, `docOptimizationGuide`, `priorFindingsFile`, `allowNewDocs`, and `approvalRequired`.

## Step 2 - Find existing project documentation

Search the relevant project area for:
- `AGENTS.md`
- `CODING_STYLE.md`
- `Testing.md`
- `Architecture.md`
- security, build, CI/CD, or tooling markdown files
- any configured docs from `technologyDocRoots`

Read every relevant file fully. Record what each file already covers and what scope it appears to own.

If `priorFindingsFile` exists and matches the requested technology, read it and treat it as cached community findings. Verify it is still relevant before relying on it.

## Step 3 - Search community sources

Search configured community sources. Default sources:
- `https://opencode.ai/docs/ecosystem`
- `https://github.com/iceflower/agent-skills`
- relevant raw `SKILL.md` files from `iceflower/agent-skills`
- `https://github.com/iceflower/agents-md`
- GitHub repository search for OpenCode skills and convention guides matching the technology

For each useful source, capture:
- source name and URL
- relevant skills or conventions
- coverage areas: coding style, testing, architecture, security, build, CI/CD

If no useful source exists, report: `No community skills/conventions found for <technology>.`

Use official or primary sources when they are more authoritative than community examples for tooling behavior, security, or current framework guidance.

## Step 4 - Extract practices

From each community source, extract:
- key rules and conventions
- examples and patterns worth adopting
- anti-patterns and "do not do" rules
- useful structure or section ideas

Keep extracts concise. Do not paste long source content into the report.

## Step 5 - Compare against project docs

Re-read all local docs identified in Step 2 before final comparison.

Build a gap table per existing file:

```text
## Gap Analysis: <technology>

### <existing-file>
| Already covered | Community adds |
|---|---|
| <existing rule> | <new rule from community> |
| <existing section> | <expanded detail> |
| - | <entirely new section> |
```

Identify docs that could be created only inside the relevant technology directory. Do not propose new markdown outside that directory.

## Step 6 - Present approval plan

Present findings before any edit:

```text
## Gap Analysis for: <technology>

### 1. <existing-file> - Suggested additions
<section/topic list with one-line reason>

### 2. <new-file> (NEW) - Proposed content
<section list and source basis>
```

Ask for approval per file or section. Always include a fast path:
- approve all
- partial approval
- skip all

If `approvalRequired` is `false`, still show the planned changes and state that config allows applying without an extra confirmation.

## Step 7 - Apply approved changes

Apply only approved changes.

For existing files:
- insert new sections near the closest related existing section
- preserve heading style, marker style, code fence language, and local terminology
- keep `AGENTS.md` concise and non-inferable

For new files:
- create them only when they do not already exist
- keep them inside the technology directory
- reference existing project docs instead of duplicating them
- include examples only when they clarify project rules

If new docs are created and a parent doc has an existing project-structure or docs index section, update that section. Do not create a broad index section just to link the new file.

## Step 8 - Report result

Report changed files:

```text
Done. Changes made:

| File | Action |
|---|---|
| <path> | Added <sections> |
| <path> | NEW - <sections> |
| <path> | Updated cross-references |
```

Also report skipped recommendations and any source that could not be checked.
