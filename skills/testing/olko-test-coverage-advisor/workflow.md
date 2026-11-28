# Olko Test Coverage Advisor

## Workflow

Input: mode (`suggest` or `apply`), `testsRoot` (default: the marketplace checkout), the artifact paths (a skill directory or an agent file), and in `apply` the accepted suggestion ids.

Read the copy of the artifact that is about to change. Look for tests in `testsRoot`. A local-only artifact has no tests there yet, so every principle that applies is `missing`. In `apply`, write only into `testsRoot`.

The advisor never blocks a sync, an optimization, or a publish. `testsRoot` is a project root only when the person asks; otherwise it is the marketplace checkout.

The current directory can be another project. Run git as `git -C <testsRoot> ...` and tests as `node --test <absolute path under testsRoot>`. Never use `cd`.

### suggest (read-only)
1. Find the artifact's tests: `scripts/` inside the skill directory; `scripts/*.test.*` and `factory/test/*.test.ts` that reference the artifact's name or script paths (`git -C <testsRoot> grep`).
2. Find the artifact's deterministic code (scripts it calls) and its guards (permission deny rules, hard rules, sanitize or leak checks).
3. For each principle in order: `covered`, `partial`, `missing`, or `n/a`, with `file:line`.
4. For each `partial` or `missing`: suggestion id (`<artifact>#TP<n>`), the scenario in one sentence, the target test file, and a TypeScript sketch.
5. Return the report. Change nothing.

### apply
1. Write each accepted suggestion as a real test in its target file. New test files are TypeScript (`*.test.ts`). An existing `.mjs` test file is extended in its own language. A test resolves every path from `import.meta.url`, not from the current directory, and spawns only `node` (`process.execPath`) and stubbed tools.
2. Run `node --test <absolute path under testsRoot>` for each touched file.
3. Vacuity check for each new test: change its expected value in the test file, run it, confirm it fails, restore the file exactly.
4. A new test that is red on existing code is a finding, not a fix: keep it with `{ todo: "<reason>" }` and report it under `Red on current code`. Such `todo` tests go into the pull request together with the other new tests.
5. Report touched files, the result per test, the vacuity result, and `todo` tests. Do not commit.

## Output
`suggest` returns JSON:

```json
{
  "artifact": "skill:<name>",
  "suggestions": [
    { "id": "<name>#TP6", "principle": "TP6", "status": "missing", "severity": "high",
      "evidence": "path:line", "scenario": "...", "targetFile": "scripts/<name>.test.ts", "sketch": "..." }
  ],
  "covered": ["TP3"],
  "notApplicable": [{ "principle": "TP4", "reason": "..." }]
}
```

`apply` returns:

```json
{ "written": ["scripts/<name>.test.ts"], "results": [{ "id": "<name>#TP6", "status": "pass", "vacuityChecked": true }] }
```

`status` in `results` is `pass` or `todo`.

## Report format
A Markdown table with columns `id | principle | status | severity | evidence | scenario | target file`. Then one fenced `ts` sketch per suggestion id. Callers show the report as it is.
