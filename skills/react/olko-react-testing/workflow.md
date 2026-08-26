# Olko React Testing Workflow

Use the workflow in `SKILL.md`.

Short path:
1. Resolve changed `.ts`/`.tsx` source and test files.
2. Load config, adapter, `TESTING.md`, `CODING_STYLE.md`, scoped docs, and root `AGENTS.md`.
3. Map source changes to related test files.
4. Inspect test conventions (Vitest/Testing Library/MSW, React Query, React Hook Form).
5. Run configured test command when needed (with explicit timeout).
6. Only when explicitly requested, drive a manual e2e check with `agent-browser` against the running dev server.
7. Report violations with rule sources.
