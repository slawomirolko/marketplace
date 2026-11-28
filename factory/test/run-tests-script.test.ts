import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const FACTORY_DIR = path.resolve(import.meta.dirname, "..");
const SHELL_AVAILABLE = spawnSync("sh", ["-c", "exit 0"]).status === 0;

interface ScriptRun {
  status: number | null;
  calls: string[];
  output: string;
}

/** Runs run-tests.sh with stub node and curl commands; `curlStatus` is the health check result, `runId` what `restart.ts begin` prints. */
function runScript(curlStatus: number, runId: string): ScriptRun {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-tests-script-"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const callsFile = path.join(root, "calls.txt").split(path.sep).join("/");
  const stub = (name: string, body: string) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  };
  stub("node", `echo "$*" >> "${callsFile}"\nif [ "$1 $2" = "test/restart.ts begin" ]; then printf '%s' "${runId}"; fi\nexit 0`);
  stub("curl", `exit ${curlStatus}`);
  stub("sleep", "exit 0");
  fs.writeFileSync(path.join(root, "run-tests.sh"), fs.readFileSync(path.join(FACTORY_DIR, "run-tests.sh"), "utf8").replace(/\r\n/g, "\n"));
  const result = spawnSync("sh", ["-c", `PATH="$(pwd)/bin:$PATH" sh ./run-tests.sh`], { cwd: root, encoding: "utf8", timeout: 60000 });
  const calls = fs.existsSync(callsFile) ? fs.readFileSync(callsFile, "utf8").split("\n").filter(Boolean) : [];
  return { status: result.status, calls, output: `${result.stdout}${result.stderr}` };
}

test("run-tests.sh stops when the server does not start", { skip: !SHELL_AVAILABLE && "sh is not available" }, () => {
  const run = runScript(1, "run-1");
  assert.notEqual(run.status, 0);
  assert.match(run.output, /server did not start/);
  assert.deepEqual(run.calls, ["src/server.ts"]);
});

test("run-tests.sh stops when the restart check returns no run id", { skip: !SHELL_AVAILABLE && "sh is not available" }, () => {
  const run = runScript(0, "");
  assert.notEqual(run.status, 0);
  assert.ok(run.calls.includes("test/restart.ts begin"), run.calls.join("\n"));
  assert.equal(run.calls.some((call) => call.startsWith("-e const r=")), false, run.calls.join("\n"));
  assert.equal(run.calls.some((call) => call.startsWith("test/restart.ts finish")), false, run.calls.join("\n"));
});
