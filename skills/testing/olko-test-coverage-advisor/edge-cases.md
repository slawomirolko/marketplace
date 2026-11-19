# Olko Test Coverage Advisor

## Edge Cases

## Artifact with no tests
- Step 1 of `suggest` finds nothing. Do not stop.
- Mark every principle that applies as `missing`. Set evidence to the artifact path.
- Use `scripts/<artifact-name>.test.ts` as the target file.

## Prompt-only artifact
- A prompt-only artifact has no script. TP1 and TP4 are `n/a`: no deterministic code, no tool interface. Give the reason.
- TP6 still applies when the artifact has deny rules or hard rules. Test them with a static test that reads the file and checks the rule text.
- TP2 asks for a static test of the prompt and its permissions.

## .mjs tests
- An existing `.mjs` test file is extended in `.mjs`. Do not convert it.
- A new test file is always `*.test.ts`.

## New test is red on existing code
- Do not fix the artifact. The test found a real gap.
- Keep the test with `{ todo: "<reason>" }`.
- Report it under `Red on current code`. Status in `results` is `todo`.

## Vacuity check
- Change only the expected value. Run the test. It must fail.
- Restore the file exactly. A test that still passes is vacuous: rewrite it and run the check again.

## Rules
- `suggest` never changes a file.
- `apply` writes only test files and test fixtures, only for accepted ids.
- Never commit, push, or open a pull request.
- Test code is erasable TypeScript only: no `enum`, no `namespace`, no parameter properties.
- Use fictional fixtures. Never copy real names, tokens, or paths into a test.
