# Skill Adaptation Contract

The Skill Adaptation Contract is a **mandatory** contract for every marketplace
skill. It complements the [Layered Skill Adaptation Pattern](layered-skill-adaptation.md):
the pattern describes *how* the adaptation layers work; this contract states
what every marketplace skill must *guarantee* so that adaptation is always
possible.

> Every marketplace skill must be adaptable by design.

This document is implementation-agnostic. It targets any AI coding agent that
follows the universal `.agents` convention. It does not reference any
vendor-specific directories.

## 1. Adaptation is mandatory support, optional use

- Every marketplace skill **may** have a project-local adapter.
- Project adaptation is **optional per project**, but **support for adaptation is
  mandatory** for every marketplace skill.
- A project that provides no adapter gets the skill's default behavior, unchanged.

## 2. Adapter location

Project adapters must use the universal `.agents` convention only. No
vendor-specific directories are referenced.

```text
.agents/skills/<skill-name>/project.md
```

`<skill-name>` matches the marketplace skill name.

## 3. Loading rules

- **If the adapter exists**, the agent must load it before executing the
  marketplace skill.
- **If no adapter exists**, the marketplace skill runs with its default behavior.

Loading assumes project adaptation is enabled for the project, which is the
default (see the `projectAdapter` flag in the Layered Skill Adaptation Pattern).
When adaptation is disabled with `projectAdapter: false`, the adapter is not
loaded even if the file is present.

## 4. No hardcoded project-specific behavior

Marketplace skills must not hardcode project-specific behavior, including but not
limited to:

- project-specific commands (build, test, lint, deploy);
- stack names or versions;
- repository paths or folder layouts;
- vendor-specific directory references.

Skills must instead read these from the adaptation layers.

## 5. Where project-specific behavior belongs

Project-specific behavior must go into exactly one of:

| Location | Holds |
|----------|-------|
| `.agents/skill-config.md` | Layer control flags and project facts (stack, test command, package manager, deployment target). |
| `.agents/skills/<skill-name>/project.md` | Per-skill project commands, constraints, and workflow specializations. |
| `AGENTS.md` | Shared, non-inferable operational knowledge (gotchas, conventions, custom tooling). |

## 6. Precedence

When two sources conflict, the higher source wins:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

1. `.agents/skill-config.md` — highest priority.
2. `.agents/skills/<skill-name>/project.md`
3. `AGENTS.md`
4. Marketplace skill — lowest priority.

The marketplace skill supplies defaults and workflow logic that hold only when
none of the higher layers override them.

## 7. Example layout

```text
.agents/
├── skill-config.md
└── skills/
    └── dotnet-clean-architecture/
        └── project.md
```

## 8. Skill authoring checklist

Every new marketplace skill must explicitly support this adaptation model. Before
a skill is added to `registry.json`, verify:

- [ ] The skill reads configuration flags and project facts from
  `.agents/skill-config.md` instead of guessing them from the repository.
- [ ] The skill loads `.agents/skills/<skill-name>/project.md` when present and
  runs with default behavior when it is absent.
- [ ] The skill contains no hardcoded project-specific commands, paths, stack
  names, or vendor directories.
- [ ] The skill documents every configuration key it recognizes.
- [ ] The skill documents its default behavior so projects know what they are
  overriding.
- [ ] The skill follows the resolution order and precedence defined in the
  Layered Skill Adaptation Pattern and this contract.
- [ ] The skill does not automatically load other skills; it loads dependencies
  only when declared via `uses` in a project adapter (see
  [Explicit Skill Reuse](explicit-skill-reuse.md)).

A skill that cannot satisfy this checklist is not eligible for the marketplace.
