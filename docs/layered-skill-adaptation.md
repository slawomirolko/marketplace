# Layered Skill Adaptation Pattern

The Layered Skill Adaptation Pattern (LSAP) is an architecture for adapting
generic, marketplace-provided skills to a specific project without forking or
rewriting them.

A skill authored in the marketplace is intentionally implementation-agnostic: it
contains reusable workflow logic and sensible defaults. A project adapts that
skill to its own stack, conventions, and tooling through three independent
layers. The layers are resolved in a fixed order and follow a strict precedence,
so the same marketplace skill can run unchanged across many projects while still
behaving as if it were hand-written for each one.

The mandatory authoring contract that every marketplace skill must satisfy is
defined in [Skill Adaptation Contract](skill-adaptation-contract.md).

This document is implementation-agnostic. It targets any AI coding agent that
follows the universal `.agents` convention. It does not reference any
vendor-specific directories.

## The three layers

| Layer | Role | Source |
|-------|------|--------|
| **Configuration-driven Behavior** | Source of truth. Decides which other layers are active and supplies project facts. | `.agents/skill-config.md` |
| **Convention Discovery** | Optional. Inspects the repository to infer conventions that are not stated in config. | Derived from the repo (only when enabled) |
| **Project Adapter** | Per-skill project instructions that override or specialize a marketplace skill. | `.agents/skills/<skill-name>/project.md` |

The layers are independent: disabling one does not affect the others. Only
**Configuration-driven Behavior** is mandatory; the other two are opt-in.

### Configuration-driven Behavior is the source of truth

Configuration is the single source of truth for how a skill runs in a project.
Specifically, configuration:

- decides whether **Convention Discovery** is enabled;
- decides whether **Project Adapters** are loaded;
- supplies project facts (`backendStack`, `testCommand`, `packageManager`,
  `deploymentTarget`, …) that skills consume instead of guessing;
- provides the **marketplace defaults** that apply only when a flag is not
  overridden.

If a flag is absent from `.agents/skill-config.md`, the marketplace skill's
documented default is used. Any value present in configuration overrides that
default. Configuration never silently changes behavior that a skill documents as
required; it only overrides the knobs a skill explicitly exposes.

## Project layout (universal `.agents` convention)

Project adapters and configuration use the universal `.agents` convention only.
No vendor-specific directories are referenced.

```text
.agents/
    skill-config.md
    skills/
        <skill-name>/
            project.md
```

- `.agents/skill-config.md` — the configuration file (see below).
- `.agents/skills/<skill-name>/project.md` — the project adapter for a single
  marketplace skill. `<skill-name>` matches the marketplace skill name.

The conventional `AGENTS.md` file (at the repository root or per directory)
remains the shared entry point for agent context and is loaded independently of
the adapter, as described in the resolution order.

## Configuration file

Path: `.agents/skill-config.md`

The file is a YAML block (optionally embedded in a short Markdown preamble).
Unknown keys are ignored by skills that do not understand them, which keeps the
format forward-compatible.

```yaml
conventionDiscovery: false
projectAdapter: true
readArchitectureDocs: true
readTestingDocs: true

backendStack: ".NET 9"
testCommand: "dotnet test"
packageManager: "NuGet"
deploymentTarget: "Docker"
```

### Flags

| Flag | Type | Default | Meaning |
|------|------|---------|---------|
| `conventionDiscovery` | `true \| false` | `false` | Enables Convention Discovery. When `false`, the agent must not inspect the repository to infer conventions unless the user explicitly requests it. |
| `projectAdapter` | `true \| false` | `false` | Loads `.agents/skills/<skill-name>/project.md` for the active skill. |
| `readArchitectureDocs` | `true \| false` | marketplace default | Hints that architecture documentation should be read as part of the workflow. |
| `readTestingDocs` | `true \| false` | marketplace default | Hints that testing documentation should be read as part of the workflow. |

Additional keys (such as `backendStack`, `testCommand`, `packageManager`,
`deploymentTarget`) are project facts. Skills read them instead of detecting the
stack from the repository. The set of recognized project facts is defined by
each marketplace skill; unrecognized keys are ignored.

## Convention Discovery (optional)

Convention Discovery is the layer that inspects the repository — file structure,
config files, manifests, existing `AGENTS.md` sections — to infer conventions
that are not already stated in `.agents/skill-config.md`.

It is **optional** and **off by default**:

```yaml
conventionDiscovery: true | false
```

When `conventionDiscovery` is `false` (or absent):

- the agent must **not** inspect the repository to infer conventions;
- it must rely on `.agents/skill-config.md`, `AGENTS.md`, and the active
  Project Adapter only;
- it may inspect the repository only when the user explicitly requests it for
  that turn.

When `conventionDiscovery` is `true`:

- the agent inspects the repository to fill gaps that configuration does not
  cover;
- inferred conventions have **lower** precedence than configuration and the
  Project Adapter (see Precedence);
- inferred conventions must never override an explicit configuration value.

## Project Adapter

The Project Adapter specializes a single marketplace skill for the current
project. It lives at:

```text
.agents/skills/<skill-name>/project.md
```

A Project Adapter:

- targets exactly one marketplace skill (`<skill-name>`);
- uses the universal `.agents` convention only — it never references
  vendor-specific directories;
- overrides, narrows, or extends the marketplace skill's workflow with
  project-specific commands, constraints, and conventions;
- is loaded only when `projectAdapter: true` in `.agents/skill-config.md`.

The Project Adapter is the middle layer in precedence: it wins over the
marketplace skill but loses to explicit configuration.

## Resolution order

When a marketplace skill is activated, the agent resolves the layers in this
fixed order:

1. **Load `.agents/skill-config.md`** — read the configuration file. If it is
   absent, apply marketplace defaults for every flag.
2. **Read configuration flags.** — evaluate `conventionDiscovery`,
   `projectAdapter`, and any project facts.
3. **If `conventionDiscovery == true`, inspect the repository.** — infer
   conventions not stated in config. Skip entirely when the flag is `false` or
   absent.
4. **Load `AGENTS.md`.** — read the universal agent context file(s) in scope.
5. **If `projectAdapter == true`, load `.agents/skills/<skill-name>/project.md`.**
   — apply the Project Adapter for the active skill. Skip when the flag is
   `false` or the file is absent.
6. **Execute the marketplace skill.** — run the skill's workflow with the
   accumulated context.

Steps 3 and 5 are gated by configuration; the others always run.

## Precedence

When two sources conflict, the higher source wins:

1. **Configuration** (`.agents/skill-config.md`) — highest priority.
2. **Project Adapter** (`.agents/skills/<skill-name>/project.md`) — second
   priority.
3. **`AGENTS.md`** — third priority; shared, non-inferable operational knowledge.
4. **Marketplace skill** — lowest priority.

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Convention Discovery does not have its own precedence tier: anything it infers is
treated as a fallback and is always overridden by configuration, the Project
Adapter, `AGENTS.md`, and the marketplace skill's explicit defaults.

In practice:

- A value in `.agents/skill-config.md` always wins.
- A statement in the Project Adapter wins over `AGENTS.md` and the marketplace
  skill but loses to configuration.
- A statement in `AGENTS.md` wins over the marketplace skill but loses to the
  Project Adapter and configuration.
- The marketplace skill supplies defaults and workflow logic that hold only when
  none of the higher layers override them.

## What belongs where

To keep the layers maintainable, each kind of information belongs in exactly one
layer.

### Marketplace skills

A marketplace skill should contain:

- reusable, project-agnostic workflow logic;
- safe defaults for every flag it exposes;
- the documented set of configuration keys it recognizes;
- generic, stack-neutral instructions and guardrails;
- the canonical resolution order and precedence contract (this document).

A marketplace skill should **not** contain:

- project-specific commands, paths, or stack names;
- repository-specific conventions that belong in a Project Adapter or config;
- vendor-specific directory references.

### Project adapters

A Project Adapter (`.agents/skills/<skill-name>/project.md`) should contain:

- project-specific commands (build, test, lint, migrate, deploy);
- project-specific constraints, naming quirks, and cross-boundary rules;
- overrides or specializations of the marketplace skill's workflow steps;
- references to project documentation the skill should read.

A Project Adapter should **not** contain:

- values that belong in configuration (stack name, test command, package
  manager, deployment target);
- generic workflow logic that the marketplace skill already provides;
- vendor-specific directory references.

### Project configuration

`.agents/skill-config.md` should contain:

- the layer control flags (`conventionDiscovery`, `projectAdapter`,
  `readArchitectureDocs`, `readTestingDocs`);
- project facts consumed by skills (`backendStack`, `testCommand`,
  `packageManager`, `deploymentTarget`, …);
- project-wide overrides for marketplace skill defaults.

It should **not** contain:

- workflow logic;
- prose instructions (those belong in `AGENTS.md` or a Project Adapter);
- per-skill specializations (those belong in the relevant Project Adapter).

### AGENTS.md

`AGENTS.md` (at the repository root or per directory) should contain:

- shared, non-inferable operational knowledge (gotchas, landmines, non-standard
  conventions);
- custom tooling commands that apply across skills;
- cross-cutting constraints not specific to a single skill.

It should **not** contain:

- per-skill specializations (those belong in the relevant Project Adapter);
- project facts and flags (those belong in `.agents/skill-config.md`).

## Implementation-agnostic note

This pattern assumes only the universal `.agents` convention and the
conventional `AGENTS.md` file. It is intended for any AI coding agent that
supports that convention. No part of this document depends on a specific agent,
plugin, or vendor runtime.
