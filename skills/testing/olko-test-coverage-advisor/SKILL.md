---
name: olko-test-coverage-advisor
version: 1.0.0
description: Advise which test principles the tests of an agent or skill miss. In suggest mode, read the artifact and its tests, and report gaps by severity with a TypeScript sketch per gap. In apply mode, write the accepted suggestions as real tests and check that each test can fail. Use when an agent or skill is added or changed, or when asked what tests an agent or skill is missing. Triggers: 'test coverage advisor', 'which tests are missing', 'test principles gap'.
---

# olko-test-coverage-advisor

## Routing Summary
Compare the tests of one agent or skill with ten fixed test principles (TP1 to TP12). Report each principle as `covered`, `partial`, `missing`, or `n/a`. Sort the report by severity. Suggest only. Write tests only in `apply` mode, and only for suggestion ids the person accepted.

## Progressive Loading
- Load `overview.md` first.
- Load `workflow.md` when you run `suggest` or `apply`.
- Load `examples.md` when you write a sketch for a principle.
- Load `edge-cases.md` for an artifact without tests, a prompt-only artifact, `.mjs` tests, or a test that is red on existing code.

## Files
- `overview.md` - principle table, severity, and `n/a` rules.
- `workflow.md` - `suggest` and `apply` steps, output shapes.
- `examples.md` - one TypeScript sketch per principle.
- `edge-cases.md` - uncommon branches and rules.
