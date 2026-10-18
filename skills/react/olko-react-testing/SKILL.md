---
name: olko-react-testing
description: "Check React test conventions for changed TypeScript/React projects with marketplace defaults. Reads project docs/adapters, maps source changes to test files, verifies Vitest + Testing Library + MSW harness conventions, no-skip/no-silent-pass policy, network-boundary test doubles, parametrization, fixture reuse, React Query/React Hook Form testing conventions, manual e2e verification on the dev machine via the agent-browser (Vercel) tool, new-component test requirements, cross-boundary contract tests, and reports violations with rule sources. Use when validating React tests, before commit/test gates, or when olko-test/olko-commit-style delegates React test-convention checks."
---

# olko-react-testing

## Routing Summary
Check React test conventions for changed TypeScript/React projects with marketplace defaults. Reads project docs/adapters, maps source changes to test files, verifies Vitest + Testing Library + MSW harness conventions, no-skip/no-silent-pass policy, network-boundary test doubles, parametrization, fixture reuse, React Query/React Hook Form testing conventions, manual e2e verification on the dev machine via the agent-browser (Vercel) tool, new-component test requirements, cross-boundary contract tests, and reports violations with rule sources. Use when validating React tests, before commit/test gates, or when olko-test/olko-commit-style delegates React test-convention checks.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what this skill checks, when to use it, and the configuration keys it reads.
- `workflow.md` - the ordered check workflow and the default React test rule catalog.
- `examples.md` - report output shapes.
- `edge-cases.md` - strict rules and failure handling.
