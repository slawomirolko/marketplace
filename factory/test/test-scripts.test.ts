import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const FACTORY_DIR = path.resolve(import.meta.dirname, "..");
/** The scripts that run test files only on request: real-model runs and the full plan documentation run. */
const ON_REQUEST_SCRIPTS = ["test:integration", "test:contract", "test:smoke", "test:full"];
/** Test files that call a real model or run for hours; the default script must never select them. */
const ON_REQUEST_FILE = /_(integration|fullrun)\.test\.ts$/;

const scripts: Record<string, string> = JSON.parse(fs.readFileSync(path.join(FACTORY_DIR, "package.json"), "utf8")).scripts;

/** The file patterns a `node ... --test <patterns>` script passes, without the quotes the shell removes. */
function patternsOf(script: string): string[] {
  const afterFlag = script.split(/\s--test\s/)[1];
  assert.ok(afterFlag, `"${script}" passes test files after --test`);
  return afterFlag.split(/\s+/).filter(Boolean).map((pattern) => pattern.replace(/^"|"$/g, ""));
}

function filesOf(scriptName: string): Set<string> {
  const script = scripts[scriptName];
  assert.ok(script, `package.json has a ${scriptName} script`);
  const files = patternsOf(script).flatMap((pattern) => fs.globSync(pattern, { cwd: FACTORY_DIR }));
  return new Set(files.map((file) => path.basename(file)));
}

const testFiles = fs.readdirSync(path.join(FACTORY_DIR, "test")).filter((file) => file.endsWith(".test.ts"));

test("the default test script runs every test file that does not call a real model", () => {
  const selected = filesOf("test");
  const missing = testFiles.filter((file) => !ON_REQUEST_FILE.test(file) && !selected.has(file));
  assert.deepEqual(missing, [], "unit test files the default script skips");
  const paid = [...selected].filter((file) => ON_REQUEST_FILE.test(file));
  assert.deepEqual(paid, [], "integration or full run files the default script selects");
});

test("every test file is run by the default script or by an integration or full run script", () => {
  const covered = new Set([...filesOf("test"), ...ON_REQUEST_SCRIPTS.flatMap((name) => [...filesOf(name)])]);
  assert.deepEqual(testFiles.filter((file) => !covered.has(file)), [], "test files no script runs");
});
