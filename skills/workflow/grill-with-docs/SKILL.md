---
name: grill-with-docs
description: A grilling session that stress-tests a plan against the project's documented domain model — sharpens fuzzy terminology, challenges it against the existing glossary, cross-references it with the code, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallize. The domain-aware variant of grill-me — use this instead when the repo has (or should have) a CONTEXT.md glossary or docs/adr/ decision records. Triggers include "grill with docs", "stress-test this against our domain model", "does this match our language", "check this against our glossary", "grill this and update the docs", or any time a non-trivial plan needs to be reconciled with the project's documented decisions.
origin: vendored
---

# Grill With Docs

Interview the user about every material part of the plan until you reach shared understanding. Ask exactly ONE question per turn. Record the user's answer in the plan tracker BEFORE asking the next question. Recommend an answer for the question you ask.

Wait for the answer before asking anything else. If an answer raises a new question, ask it in the next turn. If the codebase can answer a question, inspect it instead of asking the user.

A batch of questions may be enumerated in the plan tracker as one decision set. That bookkeeping does not change the presentation rule: the user still sees exactly one question per turn, and the full re-validation cycle still runs only after the last question in the batch is closed.

## Question content (MANDATORY)

A question the user cannot evaluate is a skill violation. Every question MUST contain, in this order:

1. **Problem** — one or two sentences: what is undecided, and the verified fact that forces a decision (`file:line` when the fact comes from code).
2. **Why I am asking** — what breaks, or what becomes unverifiable, if nobody decides.
3. **Options** — exactly 3. The first is the recommendation, marked as recommended.
4. Per option, BOTH consequences:
   - **Business** — what the user will see or be able to conclude; what stays unverifiable; what risk is accepted.
   - **Change scope** — concrete footprint: files to create/change, migrations, new producers, tests, config keys. Write "no change" only when it is truly zero.
5. **Glossary** — every domain term used in the question is defined in one clause. Never make the user decode internal names.

The recommendation states its reason in one line. Never present a known-broken option as its equal: if an option carries a defect, name that defect inside the option.

## Question format

Each question must render **exactly 3 options**:

1. The **first** option is always the recommended answer; mark it as recommended.
2. The other two are genuine alternative paths the user might prefer.
3. Do NOT add a manual catch-all option as one of the three — the user may always answer in prose.
4. Keep the option label short; put the two consequences in the option body.

If the `question` tool is available, use it. If it is not available in the session, ask in prose with the same structure and numbered options 1/2/3, and accept a single digit as the answer.

A grilling turn that asks a question without the per-option business consequence AND change-scope consequence is a skill violation, even if the reasoning is correct.

This skill is the domain-aware sibling of `max:grill-me`. `grill-me` reports ambiguities by dimension. `grill-with-docs` checks the plan against the project's terms and decisions, then updates the relevant docs as decisions are made.

---

## Adaptation

1. Read `.agents/skill-config.md` when present.
2. If `projectAdapter` is not `false`, load `.agents/skills/grill-with-docs/project.md` when present.
3. Apply rules in this order: Configuration, Project Adapter, AGENTS.md, then Marketplace Skill.
4. Run with the defaults below when no higher-priority layer overrides them.

Recognized configuration keys:

- `projectAdapter`: default `true`; controls loading the project adapter.
- `conventionDiscovery`: default `false`; when `true`, inspect the repository to find context docs, ADRs, and code answers.
- `grillQuestionMode`: default `one-per-turn`; ask exactly one question, record the answer, then ask the next.
- `grillExploration`: default `code-and-docs-when-answerable`; inspect code/docs instead of asking when the answer is discoverable and allowed.
- `contextMapPath`: default `CONTEXT-MAP.md`; overrides the multi-context map path.
- `contextFileName`: default `CONTEXT.md`; overrides context glossary file name.
- `adrDirectory`: default `docs/adr`; overrides ADR directory.

Defaults:

- Domain-aware: reconcile plans with glossary language, ADRs, and code behavior.
- Isolated: do not load other skills unless the project adapter explicitly declares `uses`.
- Lazy writes: create context and ADR files only when there is resolved content to capture.

## Domain awareness

When exploring the codebase, also look for existing documentation.

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user describes how something works, check the code. If it disagrees, explain the conflict and ask which behavior is correct. For example: "The code cancels entire Orders, but you said partial cancellation is possible. Which is correct?"

### Update CONTEXT.md inline

When the user resolves a term, update `CONTEXT.md` in the format defined by [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md). Record decisions as they arrive. Revalidate the plan only after every question is closed, one per turn.

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
