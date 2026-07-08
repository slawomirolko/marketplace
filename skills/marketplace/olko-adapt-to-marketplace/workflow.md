# Olko Adapt To Marketplace

## Workflow — follow these steps in order

### Step 1 — Resolve the marketplace root

1. If `--marketplace-root <path>` was passed, use it.
2. Otherwise, if `registry.json` exists in the current directory, assume this is the marketplace root.
3. Otherwise, walk up the directory tree looking for `registry.json` + `skills/` + `docs/`.
4. Otherwise, ask the user for the marketplace root path.

Verify the root contains `registry.json` and `skills/`. If not, stop: "Not a marketplace root: `<path>`."

### Step 2 — Locate the source skill

1. If `--source <path>` was passed, use it.
2. Otherwise, search for a directory matching `<skill-name>`:
   - under `skills/<category>/` for every category
   - under the current directory
   - under common skill install paths (`~/.claude/skills/`, `~/.codex/skills/`, `~/.config/opencode/skills/`)
3. If not found anywhere, ask the user for the source path. If the user cannot provide one, stop: "Skill `<skill-name>` not found on disk."

Read the source directory. If `SKILL.md` exists, parse its frontmatter (`name`, `description`, any other fields) and body. If no `SKILL.md`, the skill is a stub — note that for Step 7.

### Step 3 — Check registry status

Read `registry.json`. Determine whether the source skill is already registered:

- **Registered**: this is a re-onboarding / migration. Preserve the existing entry unless the name changes (Step 4) or a split happens (Step 5).
- **Not registered**: this is a fresh onboarding. No existing entry to preserve.

### Step 4 — Adapt the name

First decide the skill **origin** (see [naming convention](../docs/naming.md)):

- **authored** (default) — written for this marketplace. Apply the `olko-` prefix.
- **vendored** — copied from an external source to track upstream. Keep the upstream name; do **not** add `olko-`.

Vendored signals: the user says "copy / vendored / imported from `<repo>`", the skill references sibling skills by their upstream (non-`olko-`) names, or the source README points to an external repository. When unsure, ask: "Authored for this marketplace, or vendored from elsewhere? (authored/vendored)".

#### Authored

1. If the name already starts with `olko-`, keep it.
2. If it does not, propose the `olko-` prefixed form. Preserve the meaningful part: `smart-commit` → `olko-commit`, `test-runner` → `olko-test-runner`.
3. Sanitize: lowercase, `[^a-z0-9-]` → `-`, collapse repeats, trim leading/trailing `-`, max 64 chars, must match `^[a-z0-9]+(-[a-z0-9]+)*$` and start with `olko-`.

#### Vendored

1. Keep the upstream name as-is. Do not rename.
2. Sanitize only for filesystem safety (lowercase, normalize path separators) but preserve the upstream identity.
3. Set `origin: vendored` in the frontmatter — Step 7a records it; Step 8 carries it into the registry entry so `registry.mjs` exempts it from the `olko-` check. A vendored skill must **not** carry the `olko-` prefix (the validator rejects the combination).

Record the origin decision and the (possibly unchanged) name — Step 7a and Step 8 apply it across folder, frontmatter, and registry. If the name is ambiguous, ask the user to confirm.

### Step 5 — Analyze scope and propose split

Read the skill's body and identify its responsibilities. Classify the skill:

| Classification | Signal | Action |
|----------------|--------|--------|
| **focused** | One stack, one responsibility, < ~150 lines of workflow | Keep as-is |
| **multi-stack** | Handles 2+ unrelated stacks (e.g. .NET + Python + Kotlin) | Propose split by stack |
| **multi-phase** | Handles 2+ distinct phases that run independently (e.g. lint + test + deploy) | Propose split by phase |
| **fullstack** | Multi-stack **and** multi-phase, or > ~300 lines with clearly separable sections | Propose split by both |

Skip the split proposal when `--no-split` is set, but still report the classification.

#### Split proposal

When the skill is `multi-stack`, `multi-phase`, or `fullstack`, propose a decomposition:

- **Parent skill** — keeps the original name (adapted in Step 4), keeps the orchestration workflow, and declares each sub-skill in `uses`.
- **Sub-skills** — one per stack or phase, each named `olko-<scope>-<detail>` (e.g. `olko-test-dotnet`, `olko-test-python`). Each sub-skill is focused and independently usable.

Present the proposal:

```
Skill <skill-name> is classified as: multi-stack

Proposed split:
  Parent:  olko-test              (orchestrator)
    uses:
      - olko-test-dotnet
      - olko-test-python
      - olko-test-kotlin

  Sub-skills:
    olko-test-dotnet     — .NET unit + integration tests
    olko-test-python     — Python pytest
    olko-test-kotlin     — Kotlin JVM + instrumentation

Each sub-skill is independently invocable; the parent delegates via `uses`.
```

Ask the user via the question tool:
- **"Split into sub-skills (recommended)"** — create the parent + sub-skills
- **"Keep as one skill"** — onboard the skill without splitting
- **"Let me adjust the split"** — user edits the proposed decomposition

If the user keeps it as one skill, continue to Step 6 with the original skill. Otherwise, record the accepted decomposition for Step 7.

#### Split naming rules

- Parent keeps the adapted name from Step 4.
- Sub-skills are named `olko-<parent-scope>-<detail>`, where `<parent-scope>` is the meaningful part of the parent name and `<detail>` identifies the stack/phase.
- Sub-skill names must be unique within the marketplace.
- The parent's `uses` list must list every sub-skill by its final name.

### Step 6 — Propose the category directory

Determine the marketplace category for the skill (and each sub-skill, if split):

| Category | Use when |
|----------|----------|
| `any` | Language/stack-agnostic meta-skills (commit, install, adapt) |
| `ai` | AI/agent context optimization |
| `architecture` | Architecture enforcement, design rules |
| `dotnet` | .NET-specific skills |
| `python` | Python-specific skills |
| `testing` | Cross-stack testing skills |
| `<new>` | None of the above fit — propose a new category directory |

For a split, each sub-skill may land in a different category (e.g. `olko-test-dotnet` → `dotnet`, `olko-test-python` → `python`, parent `olko-test` → `testing`). Propose per-skill categories and ask the user to confirm.

If a new category is needed, propose the directory name (lowercase, `[^a-z0-9-]` → `-`), create the `skills/<new-category>/` directory, and note it for Step 7.

### Step 7 — Prepare and optimize the skill(s)

For the single skill (no split) **or** each skill in the decomposition (parent + sub-skills), prepare the skill so it follows the marketplace architecture and is optimized for token cost and routing. Do this per skill, in order.

#### 7a — Frontmatter

Ensure the frontmatter has valid `name` + `description` (required by `registry.json`). Set `name` to the adapted name (Step 4) or the sub-skill name (Step 5). Keep any existing valid fields (e.g. `user_invocable`).

#### 7b — Skill Adaptation Contract compliance

Verify and fix the skill body against the [Skill Adaptation Contract](../docs/skill-adaptation-contract.md) checklist:

- [ ] The skill reads configuration flags and project facts from `.agents/skill-config.md` instead of guessing them from the repository.
- [ ] The skill loads `.agents/skills/<skill-name>/project.md` when present and runs with default behavior when it is absent.
- [ ] The skill contains no hardcoded project-specific commands, paths, stack names, or vendor directories.
- [ ] The skill documents every configuration key it recognizes.
- [ ] The skill documents its default behavior so projects know what they are overriding.
- [ ] The skill follows the resolution order and precedence defined in the Layered Skill Adaptation Pattern and the contract.

For each violation, propose a concrete fix and apply it unless `--dry-run` is set.

#### 7c — Explicit Skill Reuse compliance

Verify against [Explicit Skill Reuse](../docs/explicit-skill-reuse.md):

- [ ] The skill does not auto-load other skills.
- [ ] Any skill-to-skill dependency is declared via `uses` in the project adapter, not in the skill body.
- [ ] The parent skill (in a split) declares every sub-skill in `uses`.

For the parent skill of a split, add a `## uses` section listing the sub-skills and describing how the parent delegates to each.

#### 7d — Directory and files

Place the skill in the proposed category directory:

```text
skills/<category>/<skill-name>/SKILL.md
```

If the skill has reference files or scripts (from the source `files` list), copy them into `skills/<category>/<skill-name>/` and update any internal references.

For a split, create one directory per sub-skill plus the parent:

```text
skills/testing/olko-test/SKILL.md                          (parent, uses)
skills/dotnet/olko-test-dotnet/SKILL.md
skills/python/olko-test-python/SKILL.md
skills/testing/olko-test-kotlin/SKILL.md
```

#### 7e — Progressive loading structure

Decide whether the skill ships as a single `SKILL.md` or as a progressive bundle. Measure the prepared `SKILL.md` line count against the `largeSkillLineThreshold` (100 lines) in `scripts/registry.mjs`:

| Signal | Structure | `loading` block |
|--------|-----------|-----------------|
| `SKILL.md` ≤ 100 lines AND no existing section files | Single `SKILL.md` | omit |
| `SKILL.md` > 100 lines OR any of `overview.md` / `workflow.md` / `examples.md` / `edge-cases.md` already exists | Progressive bundle | required |

`registry.mjs` auto-promotes a skill to progressive when the threshold is crossed, so prefer deciding deliberately here. When progressive is chosen, **all four** section files must exist and be listed in `files` — a partial set is rejected.

For a progressive bundle, split the source `SKILL.md` content into:

- `overview.md` — smallest useful summary: what the skill does, when to use it, prerequisites.
- `workflow.md` — the normal execution path (ordered steps). Holds the bulk of the detail.
- `examples.md` — concrete output shapes, prompt wording, command snippets. Keep terse.
- `edge-cases.md` — failure handling, uncommon branches, strict rules.

Then reduce `SKILL.md` to a thin router (mirror this skill's own `SKILL.md`):

````markdown
---
name: olko-<name>
description: "..."
---

# olko-<name>

## Routing Summary
<one-paragraph description with triggers>

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - ...
- `workflow.md` - ...
- `examples.md` - ...
- `edge-cases.md` - ...
````

Token goal: a routed-but-not-selected skill loads only `overview.md`, not the full workflow. Keep `SKILL.md` + `overview.md` small; push depth into `workflow.md`.

#### 7f — Optimization pass

Before confirming, run a four-dimension optimization (extends the `olko-install-skill` framework with an authoring-style pass). Present findings as one table.

**Dimension 1 — Token reduction**

| Signal | Suggestion |
|--------|------------|
| Section restates the Layered Skill Adaptation Pattern / Skill Adaptation Contract / Explicit Skill Reuse verbatim | Drop it — precedence gives the skill default anyway |
| Verbose prose, hedging, filler | Compress to terse commands / bullet points |
| Duplicate content across `SKILL.md` and a section file | Keep the canonical copy in the section file; trim the router |
| `overview.md` exceeds ~40 lines | Push detail into `workflow.md` |
| Reference file that nothing references | Drop from `files` and delete |

**Dimension 2 — Routing quality**

| Signal | Suggestion |
|--------|------------|
| `description` lacks trigger phrases the router matches on | Add `Triggers: '...', '...'` |
| `description` is vague ("helps with tests") | Make it specific (what + when + scope) |
| `capabilities` do not form a clean hierarchy | Normalize to `[<category>, <category>.<scope>]` |
| `tags` include the literal token `skill` or exceed 6 | Trim; keep meaningful name parts + category |
| Sub-skill `description` duplicates the parent | Make each sub-skill's description scoped to its stack/phase |

**Dimension 3 — Marketplace contribution**

| Signal | Suggestion |
|--------|------------|
| A config key the skill should recognize but doesn't document | Add it to the marketplace skill (don't leave it project-only) |
| A hardcoded project value that survived 7b | Move it to config documentation, not the body |
| A `uses` dependency the skill inherently needs | Document it; do **not** put `uses` in the registry entry |

**Dimension 4 — Authoring style (scoped caveman)**

Apply the [`caveman`](../../any/caveman/SKILL.md) mode **by file type**, not blanket. Skill content is high-traffic context, so compress prose where it is safe and keep clear prose where ambiguity is risky (this is caveman's own Auto-Clarity carve-out, applied to skill authoring).

| File / content | Style | Why |
|----------------|-------|-----|
| `SKILL.md` (router) + `overview.md` | **caveman full** — drop articles/filler, fragments OK | Routing/summary; terse lowers routing token cost |
| Prompts shown to the user, `examples.md` snippets | **caveman full** | Already terse by nature; consistency |
| `workflow.md` (multi-step procedures) | **clear prose** (no caveman) | Ordered steps; caveman's Auto-Clarity rule forbids compression where fragment order risks misread |
| `edge-cases.md` (rules, failure handling, security) | **clear prose** | Ambiguity here is dangerous; irreversible ops (commit/push/merge) need unambiguous wording |
| `description` / trigger phrases (registry + frontmatter) | **clear prose, never caveman** | Router must match triggers; stripping hurts routing |
| Commands, file paths, error strings, code blocks | **unchanged** | caveman already preserves these exact |

Rules for the caveman pass:
- Keep every technical term, symbol, command, path, and error string exact.
- One meaning per fragment — if a fragment could be read two ways, restore the conjunction/article.
- Never cavemanize a step that performs an irreversible action (push, merge, delete, force); keep it in clear prose with the confirmation wording intact.
- When in doubt, prefer clarity over compression — the progressive loading structure (7e) already prevents the heavy content from loading during routing, so the marginal token cost of clear prose in `workflow.md`/`edge-cases.md` is paid only when the skill is actually selected.

Apply accepted optimizations unless `--dry-run`. Record the final `description`, `tags`, `capabilities`, `cost`, `loading`, and the per-file style choices for Step 8.

#### 7g — Present for confirmation

Present the prepared `SKILL.md` + progressive files (or single `SKILL.md`) plus the optimization table to the user. Ask: "Write these files? (y/n)". With `--dry-run`, show the proposed content but do not write.

### Step 8 — Register in registry.json (full entry)

Add or update one entry per skill in `registry.json`. Write a **complete** entry, not a stub:

```json
{
  "name": "olko-<name>",
  "category": "<category>",
  "version": "1.0.0",
  "description": "<optimized description from 7f>",
  "tags": ["<category>", "<part>"],
  "capabilities": ["<category>", "<category>.<scope>"],
  "cost": 1,
  "files": ["SKILL.md", "..."],
  "loading": { "mode": "progressive", "first": "overview.md", "sections": ["overview", "workflow", "examples", "edge-cases"] }
}
```

Field rules (enforced by `scripts/registry.mjs`):

| Field | Rule |
|-------|------|
| `name` | `olko-` prefix for authored skills; upstream name kept for vendored. Matches folder + frontmatter. |
| `category` | existing `skills/<category>/` directory |
| `origin` | set to `vendored` when the skill is vendored (Step 4); omit for authored. `--fix` mirrors it from frontmatter. |
| `version` | semver `MAJOR.MINOR.PATCH`; `1.0.0` for new skills; bump per semver for re-onboarded skills |
| `description` | non-empty; prefer the optimized version with triggers |
| `tags` | non-empty array; ≤ 6; default-derivable from name + category |
| `capabilities` | non-empty; normalized `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`; default-derivable as `[<category>, <category>.<scope>]` |
| `cost` | positive int; 1 file → 1, ≤ 4 files → 2, else 3 |
| `files` | every shipped file; all must exist on disk; `SKILL.md` first |
| `loading` | omit for single-file skills; for progressive bundles must be `{mode: progressive, first: overview.md, sections: [overview, workflow, examples, edge-cases]}`. Vendored skills are not auto-promoted — only progressive when their section files already exist. |
| **forbidden** | `uses`, `dependencies`, `runtimeDependencies` — never in registry entries |

`scripts/registry.mjs --fix` (Step 9) preserves explicit `tags`/`capabilities`/`cost` via `??` and only fills gaps, so optimized values survive.

For a split, add one entry per sub-skill plus the parent. If the source skill was already registered (Step 3), update its entry in place rather than adding a duplicate.

Validate `registry.json` is valid JSON after editing. With `--dry-run`, show the proposed diff but do not write.

### Step 9 — Regenerate marketplace metadata

After writing files and `registry.json`, regenerate the derived artifacts so the registry is consistent. Run from the marketplace root:

```powershell
node scripts/registry.mjs --fix
```

This re-derives any missing fields, sorts entries, and regenerates:

- `skills/<category>/index.json` (one per category)
- `capability-graph.json`
- `search-index.json`

With `--dry-run`, skip this step and print the command instead.

### Step 10 — Validate (the cycle every skill must pass)

Run the validation gate:

```powershell
node scripts/registry.mjs
node --test scripts/*.test.mjs
```

Interpret results:

- `registry ok: N skills` → pass.
- Any error line → map it to the offending skill/field, fix it, return to the relevant step, and re-run Step 9 then Step 10. Loop until clean.
- A failing `.test.mjs` → fix the tooling or the skill data, re-run.

With `--dry-run`, validate the in-memory plan and report predicted errors without writing.

Common failure → fix map:

| Error from `registry.mjs` | Fix step |
|---------------------------|----------|
| `name must start with olko-` | Step 4 |
| `category must match skills/<category>/` | Step 6 / create the directory |
| `frontmatter name must match registry name` | align folder / frontmatter / entry (7a, 8) |
| `version must be MAJOR.MINOR.PATCH` | Step 8 |
| `capability '<x>' is not normalized` | Step 7f capabilities |
| `progressive loading file is missing: <f>.md` | Step 7e (create it) or remove `loading` |
| `progressive loading must list <f>.md in files` | Step 8 `files` |
| `category index is stale` / `capability graph is stale` / search index stale | Step 9 `--fix` |
| `<field> must not be declared in registry entries` | remove `uses` / `dependencies` / `runtimeDependencies` from the entry |

### Step 11 — Verify and report

Show the final state:

```
Skill <old-name> → <new-name> onboarded and validated.

Category: <category>
Directory: skills/<category>/<skill-name>/
Structure: <single SKILL.md | progressive (overview/workflow/examples/edge-cases)>
Registered: registry.json (#<index>)
Derived artifacts: index.json, capability-graph.json, search-index.json regenerated
Validation: registry ok | tests ok

Adaptation contract: ✅ compliant
Explicit skill reuse: ✅ isolated (no undeclared dependencies)
```

For a split, show the full decomposition with each skill's structure and `uses` wiring:

```
Skill <old-name> → split into <N> skills:

Parent:
  olko-test               skills/testing/   progressive   uses: [olko-test-dotnet, olko-test-python, olko-test-kotlin]

Sub-skills:
  olko-test-dotnet        skills/dotnet/    single
  olko-test-python        skills/python/    single
  olko-test-kotlin        skills/testing/   single

All registered in registry.json. Each sub-skill is independently invocable; the parent delegates via `uses`.
```

Tell the user how to verify end-to-end: run `olko-install-skill <skill-name>` from a target project to confirm the onboarded skill installs and adapts correctly.
