# Olko Optimize Project Skill

## Workflow

### Step 1 - Resolve project root

1. If `--project-root <path>` was passed, use it.
2. Otherwise, if `.agents/` exists in the current directory, use the current directory.
3. Otherwise, walk upward until `.agents/` is found.
4. If no `.agents/` exists, use the current directory and note that no project adapter layer was found.

Do not switch into the marketplace repo unless the target path points there. This skill optimizes the consuming project's copy or project-oriented source.

Read `.agents/skill-config.md` from the resolved project root. If `projectAdapter` is not `false`, read this skill's own adapter at `.agents/skills/olko-optimize-project-skill/project.md` when present. Apply optimizer-specific defaults from that adapter before resolving the target skill.

### Step 2 - Locate target skill

Resolve `<name-or-path>` in this order:

1. Exact path if it exists.
2. `.agents/skills/<name>/`.
3. `skills/<category>/<name>/` under the current repo, only when the user explicitly points at a local project-skill source.
4. Common local skill directories only if the user asks for them.

Require `SKILL.md` for the target. If absent, stop: `Target is not a complete skill: <path>`.

### Step 3 - Load only relevant files

Read:

- Target `SKILL.md`.
- Progressive files listed by the target (`overview.md`, `workflow.md`, `examples.md`, `edge-cases.md`) when present.
- Target references/scripts only when `SKILL.md` links to them or the optimization finding depends on them.
- `.agents/skill-config.md` when present.
- `.agents/skills/olko-optimize-project-skill/project.md` when present and adapters are enabled.
- `.agents/skills/<target-name>/project.md` when present.

Do not read unrelated marketplace skills except the already-known patterns from `olko-adapt-to-marketplace` and `olko-install-skill`.

### Step 4 - Classify scope

Confirm the target is project-oriented:

- Contains project commands, paths, services, stack choices, local conventions, or `.agents` adapter coupling.
- Was installed/adapted into a project.
- User explicitly says it is project-oriented.

If the target is meant for marketplace publication, stop and suggest `olko-adapt-to-marketplace`. If the target only needs initial installation/adaptation, suggest `olko-install-skill`.

### Step 5 - Analyze optimization opportunities

Create findings in four buckets.

#### Token reduction

Find content that costs context without adding behavior:

- Duplicate instructions across `SKILL.md`, progressive files, and project adapter.
- Long prose where terse bullets keep the same meaning.
- Adapter text that restates the project `AGENTS.md` exactly.
- Repeated examples that do not add cases.
- Dead sections, TODOs, stale caveats, or unused references.

Keep project-specific facts if they are not duplicated elsewhere.

#### Routing clarity

Improve only the target's routing surface:

- `description` says what the project skill does and when it triggers.
- Trigger phrases match actual user language in this project.
- `SKILL.md` router is short when progressive files exist.
- Names stay unchanged unless the user explicitly asks.

Do not make triggers generic for other projects.

#### Project adaptation alignment

Compare target skill defaults with `.agents/skill-config.md` and `.agents/skills/<target-name>/project.md`:

- Drop adapter sections that duplicate target defaults.
- Move values into config only when the target skill already reads that key.
- Mark config keys stale when the target no longer recognizes them.
- Preserve `uses` entries that represent intentional local reuse.
- Add missing `uses` only when the adapter already depends on another skill's behavior.

Do not invent new global config keys unless the target skill already documents them or the user approves adding local support.

#### Behavior preservation

Check that every proposed edit preserves:

- Project commands.
- Required file paths.
- Local service/module names.
- Safety confirmations.
- Known failure handling.
- User-facing output contract.

Reject any edit that makes the skill less project-specific just to look cleaner.

### Step 6 - Present proposed patch

Show one table:

```text
## Project-skill optimization: <target-name>

| # | Bucket | Location | Finding | Edit |
|---|--------|----------|---------|------|
| 1 | Token | SKILL.md | duplicate workflow summary | keep in workflow.md, trim router |
| 2 | Adapter | .agents/skills/<name>/project.md | test command stale | update to documented command |
```

Then state:

- Files to edit.
- Files to leave unchanged.
- Behavior assumptions.
- Validation commands available.

With `--dry-run` or `--report-only`, stop after this report.

### Step 7 - Apply in-place edits

Patch only the target skill and its matching project adapter/config. Keep edits small and traceable.

Allowed edits:

- Tighten frontmatter description.
- Shorten router sections.
- Move repeated detail into the deepest already-loaded file.
- Remove duplicated or stale adapter sections.
- Update project-specific commands when verified from repo docs or files.
- Add missing recognized config keys to `.agents/skill-config.md` only if needed.
- Fix broken links between target skill files.

Forbidden edits:

- Rename target skill.
- Move it into another category.
- Add/update `registry.json` for the target.
- Split into sub-skills.
- Remove project-specific facts because they are not reusable.
- Replace local commands with generic placeholders.

### Step 8 - Validate

Run the smallest relevant checks:

1. Parse target `SKILL.md` frontmatter.
2. Verify referenced local files exist.
3. If target lives in marketplace repo and registry entry already exists, run `node scripts/registry.mjs`.
4. If project has Markdown lint or skill validation command documented in `AGENTS.md`, run it.

Do not run marketplace release commands for a consuming-project skill unless the user asked.

### Step 9 - Report

Report:

- Target skill path.
- Changed files.
- Removed duplication.
- Preserved project-specific behavior.
- Validation result.
- Any marketplace-worthy idea kept as a suggestion only.

If a finding is general enough to benefit the marketplace skill, list it under `Possible upstream contribution`; do not apply it upstream.
