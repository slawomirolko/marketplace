---
name: olko-react-testing
description: "Check React test conventions for changed TypeScript/React projects with marketplace defaults. Reads project docs/adapters, maps source changes to test files, verifies Vitest + Testing Library + MSW harness conventions, no-skip/no-silent-pass policy, network-boundary test doubles, parametrization, fixture reuse, React Query/React Hook Form testing conventions, manual e2e verification on the dev machine via the agent-browser (Vercel) tool, new-component test requirements, cross-boundary contract tests, and reports violations with rule sources. Use when validating React tests, before commit/test gates, or when olko-test/olko-commit-style delegates React test-convention checks."
---

# Olko React Testing

## What I do
- Map changed `.ts` / `.tsx` source files to related Vitest test files (colocated `*.test.ts(x)` or `__tests__/`).
- Read test rules from `.agents/skill-config.md`, `.agents/skills/olko-react-testing/project.md`, scoped `AGENTS.md`, `TESTING.md`, and `CODING_STYLE.md`.
- Check marketplace default React test conventions unless project docs override them.
- Report violations with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `reactTestCommand` | `vitest run` | Command to run unit/component tests. |
| `reactProjectRoot` | nearest `package.json` beside `vite.config.ts`/`.js` | Override the Vite/React project root. |
| `reactTestTimeoutMs` | `120000` | Explicit timeout for `reactTestCommand`. |
| `readTestingDocs` | `true` | Whether to read test docs. |
| `reactTestingDocs` | `TESTING.md` | Additional test convention docs to read when present. |
| `reactDevCommand` | `npm run dev` | Command that starts the Vite dev server, used for manual e2e verification. |
| `reactE2ETool` | `agent-browser` | Vercel Labs browser-automation CLI used for manual e2e verification on the dev machine. |

## Default React test rules

Apply these defaults unless config, adapter, or project docs override them.

### Test tiers
- Main paths (happy paths, core user flows) MUST be covered by component/integration tests using Testing Library against real component trees and MSW-mocked network responses.
- Edge cases, error paths, and boundary values MUST be covered by unit tests (pure functions, hooks in isolation) with no network I/O.
- Full user flows through the running dev server are verified manually with `reactE2ETool` (see "Manual e2e verification" below) — this is on-demand verification, not an automated CI gate, and never replaces Vitest coverage.
- Do not write a component/integration test for algorithm edge cases (formatting, rounding, boundary values); those belong in unit tests.
- Do not write a unit test for a flow already covered by a component/integration test.

### Test harness
- Run tests through Vitest (`vitest run`), invoked from the discovered project root.
- Use `@testing-library/react` + `@testing-library/user-event` for component tests, and `jsdom` (or `happy-dom`) as the Vitest test environment.
- Use MSW (`msw`) to mock network responses at the HTTP boundary; start the MSW server in a shared setup file (e.g. `src/test/setup.ts`) referenced by `vitest.config.ts` `test.setupFiles`.
- Do not add skip logic (`it.skip`, `describe.skip`, `test.todo` left permanently) for missing services, network, or environment variables.
- Do not convert a failing test into a skipped test; report the real failure instead.

### No silent pass
- Never use an early-return branch that bypasses assertions. A test either asserts and passes, or asserts and fails.
- Never silently return from a test when a pre-condition is not met; assert the pre-condition instead.

### Coverage
- Treat coverage as a guide for untested paths, not a hard CI gate, unless project docs say otherwise.

### Merge similar tests
- When multiple tests exercise the same component/hook with the same setup and assertions but different inputs, consolidate with `it.each` / `describe.each`.
- Do not copy-paste the same test body with different inline values; parameterize instead.

### Fixtures
- Use `beforeEach` for shared per-case setup; reset MSW handlers with `server.resetHandlers()` and reset any mutable module state.
- Use a shared `QueryClient` factory (fresh instance per test, retries disabled) instead of duplicating client setup across test files.
- Do not duplicate fixture/render-helper setup across test files; extract a shared `renderWithProviders` helper.

### Test doubles
- Mock at the network boundary with MSW handlers; do not mock React Query, the fetch client, or `fetch` itself directly.
- Use `vi.fn()` only for callback props (e.g. `onSubmit`) passed into the component under test.
- Do not create test-only stubs for boundaries that an integration test must exercise against a realistic MSW-mocked response shape.

### Component and hook testing conventions
- Query by accessible role/label/text (`getByRole`, `getByLabelText`) over `data-testid` when the UI exposes an accessible name; reserve `data-testid` for elements with no meaningful accessible role.
- Use `userEvent` for interactions (`click`, `type`) instead of firing raw DOM events.
- Use `findBy*` / `waitFor` for UI that updates after an async React Query fetch resolves; do not assert on the loading state when the intent is to assert on the resolved state.
- Test custom hooks with `renderHook` from `@testing-library/react`, wrapped in the same provider stack the app uses (`QueryClientProvider`, form context, etc.) when the hook depends on it.

### React Query testing
- Wrap the component under test in a fresh `QueryClientProvider` per test; disable retries and set `gcTime`/`staleTime` to avoid cross-test cache bleed.
- Assert on rendered UI/state derived from query results, not on internal React Query cache structures.
- Mock the resolved/error response via MSW handlers, not by mocking the query hook itself.

### React Hook Form testing
- Interact through real inputs and the real submit button; assert on rendered validation-error text.
- Do not reach into `useForm` internals (`formState` object shape) from the test; assert on what the user sees.

### Manual e2e verification (dev machine)
- Use `reactE2ETool` (default `agent-browser`, the Vercel Labs browser-automation CLI) to manually walk a full user flow against the running dev server (`reactDevCommand`) when the caller/plan explicitly asks for e2e/manual verification of a UI change, or before/after a significant visual or flow change.
- Typical sequence: ensure the dev server is running, `agent-browser open http://localhost:<port>/<path>`, `agent-browser snapshot -i` to get an accessibility-tree view with refs, `agent-browser click @eN` / `agent-browser fill @eN <value>` to drive the flow, `agent-browser wait --text "<expected text>"` to confirm the outcome.
- Run `agent-browser a11y` for an accessibility audit and `agent-browser vitals` for Web Vitals/hydration summary on pages that changed. Use `agent-browser open --enable react-devtools <url>` plus `agent-browser react tree` / `agent-browser react renders` only when component-level introspection is needed.
- This is a manual, on-demand verification step performed on the developer's machine — it is not part of the automated `reactTestCommand` run and does not replace Vitest/MSW coverage.
- Do not fabricate manual e2e results; only report a manual verification as done when the tool was actually invoked in this session.

### Test organization and naming
- Test file names mirror source file names: `UserCard.test.tsx` for `UserCard.tsx`, `useUserQuery.test.ts` for `useUserQuery.ts`.
- Colocate the test file next to the file it tests (inside the component's directory), unless the project documents a centralized `__tests__/` convention.
- Each test case verifies exactly one behavior; write separate `it`/`test` blocks per behavior, not one mega-test.

### Five qualities of a good unit test
Every unit test must satisfy all five:
1. Accurate damage detection — the test must fail when code is broken.
2. Implementation-independent — the test must still pass after refactoring internals.
3. Well-explained failure — failure messages alone must be enough to identify the problem.
4. Readable test code — tests serve as documentation; intent must be obvious.
5. Fast execution — unit tests must complete quickly since they run frequently.

### Test behaviors, not functions
- Do not mechanically create one test case per exported function.
- Write separate test cases for each behavior: happy path, error/loading states, boundary values, and invalid inputs.
- Test through the public component/hook API; do not export internals just to test them.

### Assertions
- Use `expect` from Vitest plus `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.).
- Assertions must produce clear failure messages — avoid bare truthy assertions with no context.

### What not to test
- Do not write tests that assert `package.json`, `vite.config.ts`, or `tsconfig.json` contain or omit specific keys/values.
- Do not write tests that verify static structure: CSS Module class-name strings matching a hardcoded literal, route-string constants matching navigation config.
- Code review should catch configuration changes, not tests.

### What to test
- Test runtime behavior: how a component renders for given props/state, how a hook transforms data, how errors/loading are surfaced.
- Test integration points: form submission → API call → success/error UI, query error states, MSW-mocked response parsing.
- Test cross-boundary parsing where the contract is non-inferable (e.g. an API error-body shape fallback) — pin it with an assertion that breaks if the parsing changes.

### Test philosophy
- Test behavior, not structure. If a feature is removed, delete the code and its tests together.
- Tests should enable change: good tests make refactors safer, not harder.
- Fix or quarantine flaky tests immediately; they erode suite reliability.

### New component test requirement
- When a new component, hook, page, or API client method is added, write tests for it before it ships.
- Write one happy-path component/integration test per new user-facing component/page that renders it with realistic MSW-mocked data and asserts the expected output.
- Write unit tests for the most common edge/error scenarios the new component/hook will encounter.
- Do not add a new page/route to the app without corresponding test coverage.

### Contracts and cross-boundary validation
- Keep an MSW-backed test that pins the API client's request/response shape (headers, auth, request fields) and any cross-boundary parsing (error-body fallbacks) when the project depends on an external service.
- A passing MSW-backed integration test confirms the client's request/response contract; only investigate connection issues when the manual e2e verification against the real backend fails.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep `.ts` / `.tsx` files. Group source and test files by nearest Vite/React project root.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-react-testing/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `TESTING.md`, and `CODING_STYLE.md` walking up from each changed file
- any additional docs listed by `reactTestingDocs`
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Inspect test conventions
Check only changed files plus directly related test files. Common checks:
- component/integration tests mocking React Query or the fetch client instead of MSW
- unit tests performing real network I/O
- tests that verify config-file key presence/absence or static structure
- skipped tests (`.skip`, permanent `.todo`) or silent early returns that bypass assertions
- duplicate test bodies that should be parameterized
- duplicated render-helper/fixture setup across test files
- missing `findBy*`/`waitFor` after an action that triggers an async query, or asserting on a stale loading state
- missing tests for a newly added component/hook/page
- new pages/routes added without test coverage

### Step 4 - Run tests when configured
If `reactTestCommand` is configured or documented, run it for related test files after convention checks pass, using the explicit timeout from `reactTestTimeoutMs`.

### Step 4a - Manual e2e verification (only when requested)
Only when the caller/plan explicitly asks for dev-machine e2e verification: ensure the dev server is running (`reactDevCommand`), then drive the flow with `reactE2ETool` per the "Manual e2e verification" rules above. Report the exact commands run and the observed outcome.

### Step 5 - Report result
If violations exist:

```text
React test convention violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No React test convention violations found.
```

## Rules
- Marketplace defaults are allowed here to avoid repeating standard React test conventions per project.
- Never hardcode project-specific paths, names, fixtures, or test frameworks.
- Prefer documented project rules over generic React opinions.
- Do not fix tests unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
