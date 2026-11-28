/**
 * The agent CLIs start without a shell: a fake `claude`/`opencode` on PATH records the arguments
 * and the environment it receives, so quoting, validation and the child environment are checked hermetically.
 */
import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withEnv } from "./helpers/env.ts";
import { until } from "./helpers/poll.ts";
import { tempDir } from "./helpers/temp.ts";
import { cliExecutor, hostExec } from "../src/cli-backend.ts";
import { homeEnv } from "../src/home-env.ts";
import { parse as parseYaml } from "yaml";
import { opencodeConfigDir } from "../src/cli-agents.ts";

interface Probe {
  argv: string[];
  cwd: string;
  env: Record<string, string | null>;
}

const PROBED_ENV = ["FACTORY_TOKEN", "FACTORY_HOME_SECRET_PROBE", "FACTORY_KEPT_PROBE"];
const fakeDir = tempDir("factory fake cli ");
const probeScript = path.join(fakeDir, "fake-cli.js");
fs.writeFileSync(
  probeScript,
  [
    `const probe = { argv: process.argv.slice(2), cwd: process.cwd(), env: Object.fromEntries(${JSON.stringify(PROBED_ENV)}.map((name) => [name, process.env[name] ?? null])) };`,
    "const text = JSON.stringify(probe);",
    "if (process.env.FACTORY_FAKE_PID_FILE) {",
    "  require('node:fs').writeFileSync(process.env.FACTORY_FAKE_PID_FILE, String(process.pid));",
    "  setInterval(() => undefined, 1000);",
    "  return;",
    "}",
    "if (process.env.FACTORY_FAKE_MALFORMED) {",
    "  process.stdout.write('not json\\n');",
    "}",
    "if (process.env.FACTORY_FAKE_BARE_ERROR) {",
    "  process.stdout.write(JSON.stringify({ type: 'error' }) + '\\n');",
    "} else if (process.argv[2] === 'run') {",
    "  process.stdout.write(JSON.stringify({ type: 'text', sessionID: 'ses_probe', part: { type: 'text', text } }) + '\\n');",
    "  process.stdout.write(JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', tokens: { input: 1, output: 1 }, cost: 0 } }) + '\\n');",
    "} else {",
    "  process.stdout.write(JSON.stringify({ result: text, modelUsage: {}, num_turns: 1 }));",
    "}",
    "",
  ].join("\n"),
);
/**
 * The fake CLIs are installed the way npm installs the real ones: on Windows a `.cmd` shim, which the backend must
 * start through cmd.exe with escaped arguments (the case src/win-spawn.ts exists for); elsewhere an executable
 * shell script. Both hand every argument on to fake-cli.js unchanged. The folder name has spaces on purpose.
 */
for (const cli of ["claude", "opencode"]) {
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(fakeDir, `${cli}.cmd`), `@ECHO off\r\n"${process.execPath}" "%~dp0\\fake-cli.js" %*\r\n`);
  } else {
    fs.writeFileSync(path.join(fakeDir, cli), `#!/bin/sh\nexec "${process.execPath}" "${probeScript}" "$@"\n`, { mode: 0o755 });
  }
}

/**
 * The backend finds the CLIs on PATH, so the fake folder goes first for the whole file: every test spawns through it,
 * and a per-test withEnv would only repeat the same value. test.after puts the original PATH back.
 */
const originalPath = process.env.PATH;
process.env.PATH = `${fakeDir}${path.delimiter}${originalPath ?? ""}`;
test.after(() => {
  process.env.PATH = originalPath;
});

const definition = { name: "probe-agent", description: "probe", prompt: "probe" };

function probeOf(text: string | undefined): Probe {
  return JSON.parse(text ?? "{}") as Probe;
}

test("a folder with spaces and cmd.exe metacharacters reaches the CLI as one --add-dir argument", async () => {
  const awkward = tempDir("factory dir & more ^ %(x) ");
  try {
    const result = await cliExecutor("claude")({ model: "sonnet", prompt: "hi", definition, dirs: [awkward] });
    assert.ok(result.ok, result.error ?? "the CLI failed");
    const { argv } = probeOf(result.text);
    assert.equal(argv[argv.indexOf("--add-dir") + 1], awkward);
    assert.equal(argv.filter((argument) => argument === "--add-dir").length, 1);
  } finally {
    fs.rmSync(awkward, { recursive: true, force: true });
  }
});

test("a model name with characters outside the model alphabet is refused before any CLI starts", async () => {
  for (const cli of ["claude", "opencode"] as const) {
    const result = await cliExecutor(cli)({ model: "sonnet & echo injected", prompt: "hi" });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /invalid model/);
  }
});

test("an extra directory must be an existing absolute folder", async () => {
  const relative = await cliExecutor("claude")({ model: "sonnet", prompt: "hi", definition, dirs: ["relative/dir"] });
  assert.equal(relative.ok, false);
  assert.match(relative.error ?? "", /absolute existing folder/);
  const missing = await cliExecutor("claude")({ model: "sonnet", prompt: "hi", definition, dirs: [path.join(os.tmpdir(), "factory-no-such-dir-probe")] });
  assert.equal(missing.ok, false);
  assert.match(missing.error ?? "", /absolute existing folder/);
});

test("the factory token and the settings from the factory home's .env do not reach agent CLIs or host commands", async () => {
  const loaded = homeEnv.loaded;
  homeEnv.loaded = [...loaded, "FACTORY_HOME_SECRET_PROBE"];
  try {
    await withEnv({ FACTORY_TOKEN: "token-probe", FACTORY_HOME_SECRET_PROBE: "home-secret", FACTORY_KEPT_PROBE: "kept" }, async () => {
      for (const cli of ["claude", "opencode"] as const) {
        const result = await cliExecutor(cli)({ model: "sonnet", prompt: "hi" });
        assert.ok(result.ok, result.error ?? "the CLI failed");
        assert.deepEqual(probeOf(result.text).env, { FACTORY_TOKEN: null, FACTORY_HOME_SECRET_PROBE: null, FACTORY_KEPT_PROBE: "kept" }, cli);
      }
      const exec = await hostExec(process.execPath, [probeScript]);
      assert.deepEqual(probeOf((JSON.parse(exec.stdout) as { result: string }).result).env, { FACTORY_TOKEN: null, FACTORY_HOME_SECRET_PROBE: null, FACTORY_KEPT_PROBE: "kept" }, "builtin.exec");
    });
  } finally {
    homeEnv.loaded = loaded;
  }
});

test("a generated OpenCode agent may only leave its workspace for the node's extra directories", () => {
  const permissionOf = (dir: string) => {
    const text = fs.readFileSync(path.join(dir, "agents", `${definition.name}.md`), "utf8");
    fs.rmSync(dir, { recursive: true, force: true });
    return (JSON.parse(text.split("\n")[1] ?? "{}") as { permission: Record<string, unknown> }).permission;
  };
  assert.equal(permissionOf(opencodeConfigDir(definition, ["read"])).external_directory, "deny", "no extra directories, no access outside the workspace");
  const extra = path.join(os.tmpdir(), "factory-extra-probe");
  assert.deepEqual(permissionOf(opencodeConfigDir(definition, ["read"], [extra])).external_directory, { "*": "deny", [path.join(extra, "*")]: "allow" });
});

test("a marketplace agent with its own permissions may leave its workspace only for the node's own directories and the temp folder", async () => {
  const { readMarketplaceAgent } = await import("../src/marketplace-agents.ts");
  const agent = readMarketplaceAgent("olko-marketplace-upstream");
  const frontOf = (dir: string) => {
    const text = fs.readFileSync(path.join(dir, "agents", `${agent.name}.md`), "utf8");
    fs.rmSync(dir, { recursive: true, force: true });
    return text.split("\n---\n")[0]!.replace(/^---\n/, "");
  };
  const work = tempDir("factory-merge-work-");
  const limited = JSON.parse(frontOf(opencodeConfigDir(agent, ["read", "edit", "bash"], [work, ...agent.dirs], [work]))) as { model?: string; permission: Record<string, unknown> };
  assert.deepEqual(limited.permission.external_directory, { "*": "deny", [path.join(work, "*")]: "allow", [path.join(os.tmpdir(), "*")]: "allow" }, "the project, the marketplace checkout and every other folder are denied");
  assert.equal(limited.permission.edit, "allow", "the agent's other permissions stay");
  assert.deepEqual(limited.permission.bash, (parseYaml(agent.frontmatter) as { permission: { bash: unknown } }).permission.bash, "a step with the bash tool keeps the agent's bash rules");
  const noShell = JSON.parse(frontOf(opencodeConfigDir(agent, ["read", "edit"], [work, ...agent.dirs], [work]))) as { permission: Record<string, unknown> };
  assert.equal(noShell.permission.bash, "deny", "a limited step without the bash tool gets no shell, whatever the agent allows");
  assert.equal(noShell.permission.edit, "allow");
  const readOnly = JSON.parse(frontOf(opencodeConfigDir(agent, ["read"], [work], [work]))) as { permission: Record<string, unknown> };
  assert.equal(readOnly.permission.edit, "deny", "a limited step without the edit tool cannot edit");
  assert.ok(limited.model, "the agent's other front matter stays");
  assert.equal(frontOf(opencodeConfigDir(agent, ["read"], agent.dirs)), agent.frontmatter, "a node without its own directories keeps the agent's front matter as written");
});

test("the shared CLI work folder comes back after the temp cleaner removed it", async () => {
  const first = await cliExecutor("claude")({ model: "sonnet", prompt: "hi" });
  assert.ok(first.ok, first.error ?? "the CLI failed");
  const { cwd } = probeOf(first.text);
  assert.match(path.basename(cwd), /^factory-cli-/);
  fs.rmSync(cwd, { recursive: true, force: true });
  const second = await cliExecutor("claude")({ model: "sonnet", prompt: "hi" });
  assert.ok(second.ok, second.error ?? "the CLI failed after its work folder was removed");
  assert.ok(fs.existsSync(path.join(probeOf(second.text).cwd, "opencode.json")), "the work folder keeps its empty OpenCode config");
});

test("a CLI that is not installed fails the request instead of crashing the process", async () => {
  const emptyPath = tempDir("factory-empty-path-");
  try {
    for (const cli of ["claude", "opencode"] as const) {
      const result = await cliExecutor(cli)({ model: "sonnet", prompt: "hi", env: { PATH: emptyPath, Path: emptyPath } });
      assert.equal(result.ok, false, cli);
      assert.match(result.error ?? "", /ENOENT/, cli);
    }
  } finally {
    fs.rmSync(emptyPath, { recursive: true, force: true });
  }
});

test("an OpenCode error event without details still fails the request with a message", async () => {
  const result = await cliExecutor("opencode")({ model: "sonnet", prompt: "hi", env: { FACTORY_FAKE_BARE_ERROR: "1" } });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /error/);
});

test("OpenCode output lines that are not JSON are counted and named in the result", async () => {
  const succeeded = await cliExecutor("opencode")({ model: "sonnet", prompt: "hi", env: { FACTORY_FAKE_MALFORMED: "1" } });
  assert.ok(succeeded.ok, succeeded.error ?? "the CLI failed");
  assert.equal(succeeded.malformedLines, 1);
  const failed = await cliExecutor("opencode")({ model: "sonnet", prompt: "hi", env: { FACTORY_FAKE_MALFORMED: "1", FACTORY_FAKE_BARE_ERROR: "1" } });
  assert.equal(failed.ok, false);
  assert.equal(failed.malformedLines, 1);
  assert.match(failed.error ?? "", /1 malformed output lines dropped/);
});

function processGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

for (const cli of ["claude", "opencode"] as const) {
  test(`an aborted ${cli} request ends the CLI process and fails the request`, async () => {
    const pidFile = path.join(tempDir("factory-cli-abort-"), "pid");
    const controller = new AbortController();
    const pending = cliExecutor(cli)({ model: "sonnet", prompt: "hi", env: { FACTORY_FAKE_PID_FILE: pidFile }, signal: controller.signal });
    const pid = await until(() => (fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : 0), "the fake CLI to start");
    controller.abort();
    const result = await pending;
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /\(aborted\)/);
    await until(() => processGone(pid), `the CLI process ${pid} to end`);
  });
}
