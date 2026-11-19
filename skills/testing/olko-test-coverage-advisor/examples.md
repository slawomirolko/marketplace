# Olko Test Coverage Advisor

## Examples
Load this file when you write a sketch. Each sketch has one test that covers one principle. Fixtures are fictional. The code is erasable TypeScript. The style follows `factory/test/clean-tmp.test.ts`.

Names such as `sync-plan.ts`, `check-leaks.ts`, and `sync-cli.ts` are placeholders. Replace them with the real script of the artifact.

## TP1 Logic in code, judgment in the model
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { dedupe } from "../src/sync-plan.ts";

test("duplicate entries collapse to one, in first-seen order", () => {
  const result = dedupe(["alpha", "beta", "alpha", "gamma", "beta"]);
  assert.deepEqual(result, ["alpha", "beta", "gamma"]);
});
```

## TP2 Test pyramid
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("static: the agent file denies commit and push", () => {
  const text = fs.readFileSync(path.join("agents", "opencode", "example-agent.md"), "utf8");
  assert.match(text, /"git commit \*": deny/);
  assert.match(text, /"git push \*": deny/);
});
```

## TP3 Hermetic
```ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("the script calls the stubbed gh on PATH and never the real one", () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "stub-bin-"));
  const log = path.join(bin, "calls.log");
  fs.writeFileSync(path.join(bin, "gh"), `#!/bin/sh\necho "$@" >> "${log}"\n`, { mode: 0o755 });

  spawnSync("node", ["scripts/sync-cli.ts", "--dry-run"], {
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
  });

  assert.ok(fs.readFileSync(log, "utf8").includes("pr list"));
});
```

## TP4 Tool interface is for the agent
```ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("a blocked run exits 2 with JSON on stdout; a crash exits 1", () => {
  const blocked = spawnSync("node", ["scripts/sync-cli.ts", "--root", "missing-dir"], { encoding: "utf8" });
  const body = JSON.parse(blocked.stdout);
  assert.equal(body.status, "blocked");
  assert.ok(body.error.length > 0);
  assert.equal(blocked.status, 2);
});
```

## TP5 Outcome, not path
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writePlan } from "../src/sync-plan.ts";

test("the plan file holds the final entries; step order is not asserted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-"));
  writePlan(dir, ["alpha", "beta"]);
  const plan = JSON.parse(fs.readFileSync(path.join(dir, "plan.json"), "utf8"));
  assert.deepEqual(plan.entries.sort(), ["alpha", "beta"]);
});
```

## TP6 Guards are hard
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { checkLeaks } from "../src/check-leaks.ts";

test("leak check: a fictional token is flagged, clean text passes", () => {
  const leaked = checkLeaks("token = tok_FICTIONAL_0000");
  assert.equal(leaked.ok, false);
  assert.equal(leaked.findings.length, 1);

  const clean = checkLeaks("no secrets here");
  assert.equal(clean.ok, true);
  assert.equal(clean.findings.length, 0);
});
```

## TP7 Idempotence
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writePlan } from "../src/sync-plan.ts";

test("a second run with the same input changes nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "idem-"));
  writePlan(dir, ["alpha"]);
  const first = fs.readFileSync(path.join(dir, "plan.json"), "utf8");
  writePlan(dir, ["alpha"]);
  assert.equal(fs.readFileSync(path.join(dir, "plan.json"), "utf8"), first);
});
```

## TP9 No vacuous pass
```ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("evidence first: parse the JSON, then check the exit code", () => {
  const run = spawnSync("node", ["scripts/sync-cli.ts", "--list"], { encoding: "utf8" });
  const body = JSON.parse(run.stdout);
  assert.deepEqual(body.items, ["alpha", "beta"]);
  assert.equal(run.status, 0);
});
```

## TP10 Determinism
```ts
import assert from "node:assert/strict";
import test from "node:test";
import { hashEntries } from "../src/sync-plan.ts";

test("the hash does not depend on input order or on the clock", () => {
  const one = hashEntries(["alpha", "beta"]);
  const two = hashEntries(["beta", "alpha"]);
  assert.equal(one, two);
  assert.match(one, /^[0-9a-f]{64}$/);
});
```

## TP12 Fast and independent
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("each test owns a temp dir and removes it in t.after", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "own-dir-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "state.json"), "{}");
  assert.ok(fs.existsSync(path.join(dir, "state.json")));
});
```
