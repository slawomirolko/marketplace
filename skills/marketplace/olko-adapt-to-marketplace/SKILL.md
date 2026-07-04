---
name: olko-adapt-to-marketplace
description: "Onboard a skill from a local directory into the marketplace, even if it is not yet registered. Adapts the name to the olko- convention, analyzes whether the skill should be split into smaller sub-skills orchestrated by one parent skill, proposes the marketplace category directory, and prepares the skill and/or sub-skills to follow the marketplace architecture (Layered Skill Adaptation Pattern, Skill Adaptation Contract, Explicit Skill Reuse). Triggers: 'adapt to marketplace', 'onboard skill', 'split skill', 'prepare skill for marketplace', 'olko-adapt-to-marketplace <name>'."
---

# Olko Adapt To Marketplace

The inverse of `olko-install-skill`. That skill installs **from** the marketplace **into** a project. This skill takes a skill **from** a local directory and prepares it **for** the marketplace.

## What I do
- Take a skill by name and locate it on disk (even if it is **not** in `registry.json`)
- Adapt the skill name to the `olko-` naming convention
- Analyze the skill's scope and suggest splitting it into smaller sub-skills orchestrated by one parent skill (when the skill is "fullstack" / does too much)
- Propose the marketplace category directory for the skill
- Prepare the skill and/or sub-skills to follow the marketplace architecture: Layered Skill Adaptation Pattern, Skill Adaptation Contract, Explicit Skill Reuse
- Register the prepared skill(s) in `registry.json`

## When to use me
User says "adapt to marketplace", "onboard `<name>`", "split `<name>`", "prepare `<name>` for marketplace", or invokes `/olko-adapt-to-marketplace <name>`. Also when a skill exists locally but is not yet registered, or when a skill has grown too large and should be decomposed.

## Prerequisites
- Run from the marketplace repository root (where `registry.json`, `skills/`, and `docs/` live), **or** provide the marketplace root path as the first resolved input
- The source skill directory must be readable on disk

## Flag & argument parsing

Parse `$ARGUMENTS`:

| Token | Effect |
|-------|--------|
| `<skill-name>` | The skill to onboard (required). May be a name or a path. |
| `--source <path>` | Explicit source directory for the skill (skip discovery) |
| `--marketplace-root <path>` | Explicit marketplace root (skip discovery) |
| `--no-split` | Analyze but do not propose a split |
| `--dry-run` | Show all proposed changes without writing files |
| `--help` | Display usage and exit |

If `--help` or no skill name: display usage and stop.

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

Apply the [naming convention](../docs/naming.md):

1. If the name already starts with `olko-`, keep it.
2. If it does not, propose the `olko-` prefixed form. Preserve the meaningful part: `smart-commit` → `olko-commit`, `test-runner` → `olko-test-runner`.
3. If the name is ambiguous, ask the user to confirm the proposed name.
4. Record the old name (if any) and the new name — Step 8 updates it across folder, frontmatter, and registry.

Sanitize: lowercase, `[^a-z0-9-]` → `-`, collapse repeats, trim leading/trailing `-`, max 64 chars, must start with `olko-`.

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

### Step 7 — Prepare the skill(s)

For the single skill (no split) **or** each skill in the decomposition (parent + sub-skills), prepare the `SKILL.md` so it follows the marketplace architecture. Do this per skill:

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

#### 7e — Present for confirmation

Present the prepared `SKILL.md`(s) to the user. Ask: "Write these files? (y/n)". With `--dry-run`, show the proposed content but do not write.

### Step 8 — Register in registry.json

Add or update one entry per skill in `registry.json`:

```json
{
  "name": "<skill-name>",
  "category": "<category>",
  "files": [ "SKILL.md", ... ]
}
```

- `name` — the adapted name (must start with `olko-`).
- `category` — the directory from Step 6.
- `files` — every file the skill ships (at minimum `SKILL.md`, plus reference files / scripts copied in Step 7d).

For a split, add one entry per sub-skill plus the parent. If the source skill was already registered (Step 3), update its entry (name, category, files) rather than adding a duplicate.

Validate `registry.json` is valid JSON after editing. With `--dry-run`, show the proposed diff but do not write.

### Step 9 — Verify and report

Show the final state:

```
Skill <old-name> → <new-name> onboarded to the marketplace.

Category: <category>
Directory: skills/<category>/<skill-name>/
Registered: registry.json (#<index>)

Adaptation contract: ✅ compliant
Explicit skill reuse: ✅ isolated (no undeclared dependencies)
```

For a split, show the full decomposition:

```
Skill <old-name> → split into <N> skills:

Parent:
  olko-test               skills/testing/         uses: [olko-test-dotnet, olko-test-python, olko-test-kotlin]

Sub-skills:
  olko-test-dotnet        skills/dotnet/
  olko-test-python        skills/python/
  olko-test-kotlin        skills/testing/

All registered in registry.json. Each sub-skill is independently invocable; the parent delegates via `uses`.
```

Tell the user how to verify: run `olko-install-skill <skill-name>` from a target project to confirm the onboarded skill installs and adapts correctly.

## Rules
- Follow the [naming convention](../docs/naming.md): `olko-` prefix across folder, frontmatter, and registry
- Every prepared skill must satisfy the [Skill Adaptation Contract](../docs/skill-adaptation-contract.md) checklist before it is registered
- Sub-skills are focused and independently invocable; the parent orchestrates them via `uses` (Explicit Skill Reuse)
- Never auto-load skills — composition is explicit through `uses` declared in the project adapter
- A skill that cannot satisfy the adaptation contract is not registered; report which checklist items failed
- Preserve existing reference files and scripts; copy them into the new directory and fix internal references
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports its own project adapter at `.agents/skills/olko-adapt-to-marketplace/project.md`
