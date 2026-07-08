# Olko Install Skill

## Workflow — follow these steps in order

### Step 1 — Resolve the marketplace registry

1. If `.agents/skill-config.md` exists and contains a `marketplace` key, use that path/URL.
2. Otherwise, ask the user for the marketplace root path or registry URL.
3. Read `registry.json`. Parse the `skills` array.

### Step 2 — Validate the skill exists

Find an entry whose `name` matches `<skill-name>`.

- **Not found**: list available skill names from the registry and stop. Tell the user: "Skill `<skill-name>` not found in the marketplace. Available: …".
- **Found**: record its `category` and `files` list.

### Step 3 — Load the marketplace skill

Read the skill's `SKILL.md` only as much as needed. Extract:

- What the skill does (description / "What I do" section).
- Configuration keys the skill recognizes (look for a "Configuration keys", "Flags", "Config", or similar section, or the documented defaults).
- The skill's default behavior (what holds when no adapter/config overrides it).
- Any `uses` dependencies the skill itself suggests (rare; most skills are isolated).

Present a short summary to the user:

```
Skill: <skill-name> (<category>)
Purpose: <one-line summary>
Recognized config keys: <list, or "none documented">
Default behavior: <one-line summary>
```

### Step 4 — Inspect existing adaptation

Determine whether this is a **fresh install** or an **update**:

| Check | Path | Meaning |
|-------|------|---------|
| Project config | `.agents/skill-config.md` | Project-wide flags + facts |
| Project adapter | `.agents/skills/<skill-name>/project.md` | Per-skill specialization |

Read both if they exist. Classify each existing config key and adapter section as:

- **keep** — still wanted
- **modify** — wanted but needs a new value
- **drop** — no longer wanted

### Step 4b — Analyze existing adaptation for optimization opportunities

**Skip this step on fresh installs.** Run only when an adaptation already exists (update mode).

Compare the existing `.agents/skill-config.md` and `.agents/skills/<skill-name>/project.md` against the marketplace skill's `SKILL.md` loaded in Step 3. Analyze across three dimensions and present findings as a single table before Step 5.

#### Dimension 1 — Token reduction

Look for adaptation content that costs context without adding value:

| Signal | Suggestion |
|--------|------------|
| Config key duplicates the marketplace default | Drop the key — the default already applies |
| Adapter section restates marketplace skill content verbatim | Drop the section — precedence gives the skill default anyway |
| Verbose prose in the adapter | Compress to terse commands / bullet points |
| `conventionDiscovery: true` while config already states every fact | Suggest `false` — discovery adds a repo scan for nothing |
| Adapter section whose content is discoverable from code or `AGENTS.md` | Suggest dropping it (AGENTS.md already covers it at lower precedence) |
| Redundant `uses` entry that the skill never actually consumes | Drop it — dead dependency, costs a load |

#### Dimension 2 — Behavior improvement

Look for adaptation gaps or stale values that hurt skill behavior:

| Signal | Suggestion |
|--------|------------|
| Skill recognizes a config key the adaptation doesn't set | Suggest adding it with a project-appropriate value |
| Config value no longer matches the repo (e.g. `testCommand` changed) | Suggest updating to the current command |
| Adapter overrides a step the marketplace skill no longer has (renamed/removed) | Flag as stale — drop or re-map |
| Adapter override contradicts the Skill Adaptation Contract (hardcodes project behavior the skill should read from config) | Suggest moving the value to config |
| Missing `uses` dependency the adapter implies (references another skill's behavior) | Suggest declaring it in `uses` |
| `projectAdapter: false` while a `project.md` exists | Inconsistent — suggest enabling the flag or removing the file |

#### Dimension 3 — Marketplace contribution

For each optimization, decide whether it is **project-specific** or **general**:

- **Project-specific** (repo commands, stack name, naming quirks) → apply locally, in config or adapter.
- **General** (would benefit every project using this skill) → suggest contributing to the marketplace skill instead of keeping a local override.

General improvements that belong in the marketplace include:

- A marketplace default that is wrong for most projects.
- A config key the skill should recognize but doesn't document yet.
- A workflow step that every project overrides the same way.
- A missing `uses` dependency that the skill inherently needs.

For each general improvement, present:

```
Marketplace suggestion:
  The <X> override in your adapter is not project-specific — every project
  using <skill-name> would benefit. Consider contributing it to the marketplace
  skill at <marketplace-root>/skills/<category>/<skill-name>/SKILL.md.
  Apply locally anyway? (y/n)
```

If the user says **yes**, apply locally now (Step 5+) and remind them at Step 8 to contribute upstream. If **no**, skip the local override and record the suggestion for the Step 8 report.

#### Present findings

Combine all three dimensions into one table:

```
## Adaptation analysis for <skill-name>

### Token reduction
| # | Location | Finding | Suggestion |
|---|----------|---------|-------------|
| 1 | config | testCommand duplicates marketplace default | Drop key |
| 2 | adapter | ## Build restates skill workflow | Drop section |

### Behavior improvement
| # | Location | Finding | Suggestion |
|---|----------|---------|-------------|
| 3 | config | missing readTestingDocs (skill recognizes it) | Add: true |
| 4 | adapter | testCommand stale (repo switched to --no-restore) | Update value |

### Marketplace contribution
| # | Finding | Suggestion |
|---|---------|------------|
| 5 | Default testCommand wrong for most .NET projects | Contribute to marketplace; apply locally? (y/n) |
```

Feed all **accepted** suggestions into Step 5 as pre-filled keep/modify/drop decisions. The user can still override any of them in Step 5d.

### Step 5 — Ask what to customize

Use the question tool to ask the user. Adapt the questions to fresh vs. update mode.

#### 5a — Layer control flags

Ask which flags to set (present current values when updating, marketplace defaults when fresh):

| Flag | Default | Question |
|------|---------|----------|
| `conventionDiscovery` | `false` | "Enable Convention Discovery (inspect repo to infer conventions)?" |
| `projectAdapter` | `false` | "Create a Project Adapter for this skill?" |
| `readArchitectureDocs` | marketplace default | "Read architecture docs when this skill runs?" |
| `readTestingDocs` | marketplace default | "Read testing docs when this skill runs?" |

#### 5b — Project facts

Ask which project facts to set. Offer the standard set plus any keys the marketplace skill documented:

| Fact | Example | Question |
|------|----------|----------|
| `backendStack` | ".NET 9" | "What is the backend stack?" |
| `testCommand` | "dotnet test" | "What command runs the tests?" |
| `packageManager` | "NuGet" | "What is the package manager?" |
| `deploymentTarget` | "Docker" | "What is the deployment target?" |

Skip facts the marketplace skill does not recognize (unless the user explicitly wants them).

#### 5c — Project adapter content (only if `projectAdapter: true`)

Ask what goes into `.agents/skills/<skill-name>/project.md`:

- **project-specific commands** (build, test, lint, migrate, deploy) — ask for each the skill needs
- **constraints & naming quirks** — free-form
- **workflow specializations** — which steps to override or extend
- **`uses` dependencies** — does this skill reuse another? If yes, collect skill names for the `uses` list (see Explicit Skill Reuse)
- **caveman strict mode** — if the user wants terse output, add `caveman` to `uses` instead of duplicating compression rules in prose

#### 5d — Update mode: keep / modify / drop

When updating an already-adapted skill, present the existing state first. **Pre-fill** the table with any suggestions the user accepted in Step 4b (token reduction, behavior improvement, marketplace suggestions the user chose to apply locally). Mark the rest as `keep` by default:

```
Existing adaptation for <skill-name>:

skill-config.md:
  conventionDiscovery: false   ← keep
  projectAdapter: true         ← keep
  testCommand: "dotnet test"   ← modify → "dotnet test --no-restore"  [from analysis #4]

project.md:
  ## Build
  dotnet build                 ← keep
  ## Test
  dotnet test --no-restore     ← drop (now in config)                [from analysis #2]
```

Then ask, per field/section: **Keep / Modify / Drop**. The user can accept the pre-filled suggestions or override them. Apply the final choices.

### Step 6 — Generate `.agents/skill-config.md`

Merge the new values with the kept values. Never drop unrelated keys that other skills depend on.

- If the file does not exist, create it with the standard preamble + YAML block.
- If it exists, update only the keys the user changed or confirmed; preserve everything else.
- Include the standard layer control flags and the project facts the user set.
- If `marketplace` was resolved in Step 1, persist it so future runs don't ask again.

Present the proposed file and ask the user to confirm before writing. With `--force`, skip per-field confirmation but still confirm the final file once.

### Step 7 — Generate `.agents/skills/<skill-name>/project.md`

Only when `projectAdapter: true`.

- Create the `.agents/skills/<skill-name>/` directory if needed.
- Write `project.md` with the sections from Step 5c.
- If `uses` dependencies were declared, include the `uses` block.
- When updating: preserve kept sections, apply modified sections, remove dropped sections.

Present the proposed file and ask the user to confirm before writing. With `--force`, confirm once.

### Step 8 — Verify and report

Show the final state:

```
Skill <skill-name> installed and adapted.

Configuration (.agents/skill-config.md):
  conventionDiscovery: false
  projectAdapter: true
  testCommand: "dotnet test --no-restore"
  ...

Project adapter (.agents/skills/<skill-name>/project.md):
  - Build: dotnet build
  - Test: dotnet test --no-restore
  - uses: olko-test-dotnet

Next: invoke <skill-name> in your workflow. It will load this adaptation automatically.
```

#### Gitignore guidance

The files this skill writes are **shared project knowledge** — commit them so the whole team and every AI tool gets the same adaptation. Do **not** gitignore `.agents/skill-config.md` or `.agents/skills/*/project.md`.

The `.agents/context/` tree is a separate concern (created by the context-store tooling, not by this skill). It mixes durable and regenerable state — follow the rule from the marketplace README:

| Path in the consuming project | Commit / Ignore |
|-------------------------------|-----------------|
| `.agents/skill-config.md` | commit |
| `.agents/skills/*/project.md` | commit |
| `.agents/context/memory/*.md` | commit (durable skill knowledge) |
| `.agents/context/scratchpad/` | ignore (regenerable per-task state) |
| `.agents/context/summaries/` | ignore (regenerated after each task) |
| `.agents/context/cache/` | ignore (cache) |

Suggested `.gitignore` snippet to print for the user:

```gitignore
# Regenerable per-task context state
.agents/context/scratchpad/
.agents/context/summaries/
.agents/context/cache/
```

Print this guidance once per install. On update mode, only re-print it if `.agents/context/` is new or the user asks. Keep it terse (caveman is fine here — it is a report, not a procedure).

#### Marketplace contribution reminders

If Step 4b identified general improvements the user chose **not** to apply locally (or chose to apply locally but also contribute upstream), list them here:

```
Marketplace contributions to consider:
  1. <skill-name>: default testCommand should be "dotnet test --no-restore"
     → edit <marketplace-root>/skills/<category>/<skill-name>/SKILL.md
  2. <skill-name>: add readTestingDocs to recognized config keys
     → edit <marketplace-root>/skills/<category>/<skill-name>/SKILL.md
```

Do not modify the marketplace files automatically. Only suggest the edits and their locations. The user contributes upstream explicitly.

Tell the user how to verify: invoke the skill and confirm it reads the new config/adapter.
