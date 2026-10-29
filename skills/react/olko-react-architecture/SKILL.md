---
name: olko-react-architecture
description: "Check React architecture compliance for changed TypeScript/React projects with marketplace defaults. Reads project docs and adapters, maps changed .ts/.tsx files to the nearest package.json/Vite project root, verifies component/pages source layout, module boundaries, dependency direction, React Query data-layer separation, typed fetch-based API client ownership, React Hook Form boundaries, CSS Modules styling boundaries, and TypeScript strictness, and reports violations with rule sources. Use when validating React architecture, before commit/test gates, during plan review, or when olko-commit-style/olko-test/olko-plan-editor delegates React architecture checks."
---

# olko-react-architecture

## Routing Summary
Check React architecture compliance for changed TypeScript/React projects with marketplace defaults. Reads project docs and adapters, maps changed `.ts`/`.tsx` files to the nearest package.json/Vite project root, verifies component/pages source layout, module boundaries, dependency direction, React Query data-layer separation, typed fetch-based API client ownership, React Hook Form boundaries, CSS Modules styling boundaries, and TypeScript strictness, and reports violations with rule sources. Use when validating React architecture, before commit/test gates, during plan review, or when olko-commit-style/olko-test/olko-plan-editor delegates React architecture checks. Security rules live in `olko-react-security`.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `examples.md` only when output shape or command examples are needed.
- Load `edge-cases.md` only for uncommon branches, failure handling, and strict rules.

## Files
- `overview.md` - what this skill checks, when to use it, and the configuration keys it reads.
- `workflow.md` - the ordered check workflow and the default React architecture rule catalog.
- `examples.md` - report output shape.
- `edge-cases.md` - strict rules and failure handling.
