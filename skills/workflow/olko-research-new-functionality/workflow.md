# olko-research-new-functionality

## Workflow

1. Establish scope

- Restate the requested capability, affected business outcome, and explicit exclusions.
- Identify the likely source-of-truth component, consumers, write paths, and runtime surfaces.
- Read the repository root `AGENTS.md` and every nearest slice-level `AGENTS.md`/`CODING_STYLE.md` for files likely to be affected.
- Check `.agents/skill-config.md` and the project adapter when present.
- Inspect `git status --short` before making any edit; preserve unrelated user changes.

2. Find the live mechanism

- Search filenames, identifiers, configuration keys, queues, RPCs, database tables, and prompts with `rg`/`rg --files`.
- Start from real entrypoints and trace the call graph through orchestration, persistence, messaging, and output.
- Read the full relevant source files, not only matching lines.
- Inspect existing unit, integration, contract, and runtime tests before proposing new tests.
- Treat saved plans, AGENTS text, and comments as hypotheses until confirmed by live code.

3. Map the current flow

Produce a real file-and-line flow graph:

```text
[trigger] (file:line)
  └─> [orchestrator] (file:line)
       ├─> [source/context read] (file:line)
       ├─> [computation or agent workflow] (file:line)
       ├─> [message/RPC boundary] (file:line)
       └─> [persistence/output] (file:line)
```

Include transaction boundaries, retry/timeout behavior, idempotency, concurrency, and observability. Mark missing links explicitly.

4. Compare architecture options

For the requested functionality, compare at least three viable patterns when applicable:

- deterministic backend feature engineering/statistical service;
- durable memory or feature-snapshot read model consumed by an AI workflow;
- separate specialist AI workflow/agent with a typed contract;
- a hybrid only when the deterministic layer owns validation and the AI layer owns interpretation.

Prefer the least coupled option that can be shadowed, replayed, measured, disabled, and rolled back. Keep lifecycle truth and final writes in the existing authoritative backend. Do not put durable business rules only in prompts or in-memory state.

For seasonal or cyclical behavior specifically:

- distinguish calendar seasonality (`month`, `day-of-year`, trading session) from endogenous cycles (roll cycle, prior move, volatility regime);
- use normalized returns or direction outcomes, never raw price levels across years;
- require minimum sample counts, recency weighting, confidence/shrinkage toward a global prior, and a neutral fallback;
- prevent leakage by using only information available before the prediction timestamp;
- separate descriptive evidence from a directional recommendation;
- test the feature out-of-time and by commodity/horizon, not only on aggregate accuracy.

5. Estimate effectiveness and risk

Give an evidence-based estimate, not a fabricated guarantee. Define:

- baseline and treatment;
- target metrics: directional accuracy, balanced accuracy, Brier/log loss, calibration, expectancy after costs, coverage, and abstention rate;
- minimum sample and evaluation window;
- shadow/A-B or champion/challenger method;
- acceptance thresholds and rollback trigger.

State likely effectiveness as a range with confidence level and explain what could make it lower. For financial direction signals, treat seasonality as a conditional prior or confidence modifier unless the backtest proves independent incremental lift. Never let it override stronger live signals by default.

6. Design the integration

Describe the smallest coherent change across:

- source data and computation owner;
- durable model/table or existing snapshot extension;
- application service/repository and unit-of-work boundary;
- gRPC/HTTP/message contract and generated-client implications;
- AI workflow adapter, prompt/tool input, fusion or allocator insertion point;
- decision/audit payload;
- configuration and feature flags;
- telemetry, logs, metrics, replay and failure behavior;
- test changes, reusing existing fixtures and parameterized tests where possible.

7. Report documentation and implementation boundaries

Only suggest additions to existing AGENTS files for non-inferable facts: cross-boundary rules, naming quirks, custom commands, optional wiring, or operational constraints. Do not create documentation files automatically. Separate research findings from implementation plans; implementation starts only after explicit user authorization.
